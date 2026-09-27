/**
 * 本地音乐库（core 层通用能力，不依赖业务层）
 *
 * 职责：把用户选择的本地音频文件转成可播放的 Song 对象，并解析基础元数据。
 *
 * 设计约束：
 *  - 本地音乐仅存活于当前会话：通过 URL.createObjectURL 生成的 blob 直链在刷新后失效，
 *    因此持久化层（session.js）会剔除 source === "local" 的条目，本模块不负责跨会话恢复。
 *  - 零运行时依赖：内置精简标签解析器，覆盖 MP3(ID3v2/ID3v1) 与 FLAC(Vorbis Comment)；
 *    其余格式（m4a/ogg 等）回落到「文件名」推断，不解析内嵌封面。
 */

import type { Song } from "../constants.js";

export const LOCAL_SOURCE = "local";

const AUDIO_EXTENSIONS = new Set([
    "mp3",
    "flac",
    "m4a",
    "aac",
    "ogg",
    "oga",
    "opus",
    "wav",
    "wma",
    "aiff",
    "aif",
    "ape",
]);

const HEAD_BYTES = 512 * 1024;

export interface LocalAudioTags {
    name: string;
    artist: string;
    album: string;
}

export function isLocalSong(song: unknown): boolean {
    return Boolean(song && typeof song === "object" && (song as { source?: unknown }).source === LOCAL_SOURCE);
}

export function getLocalAudioUrl(song: unknown): string | null {
    if (!isLocalSong(song)) return null;
    const url = (song as { localUrl?: unknown }).localUrl;
    return typeof url === "string" && url !== "" ? url : null;
}

/** 释放某一首本地歌曲占用的 blob 直链（去重丢弃、移除歌曲时调用） */
export function revokeLocalSong(song: unknown): void {
    const url = getLocalAudioUrl(song);
    if (!url) return;
    try {
        URL.revokeObjectURL(url);
    } catch (error) {
        console.warn("释放本地音频地址失败", error);
    }
}

export function isAudioFile(file: File): boolean {
    if (typeof file.type === "string" && file.type.startsWith("audio/")) {
        return true;
    }
    const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
    return AUDIO_EXTENSIONS.has(extension);
}

/** 同一文件（同名、同大小、同修改时间）在一台设备上视为同一首，用于会话内去重 */
export function localSongId(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}`;
}

function stripExtension(fileName: string): string {
    const index = fileName.lastIndexOf(".");
    return index > 0 ? fileName.slice(0, index) : fileName;
}

/** 兜底：从「艺术家 - 标题」文件名推断 */
function parseFilenameFallback(fileName: string): LocalAudioTags {
    const base = stripExtension(fileName).trim();
    const match = base.match(/^\s*(.+?)\s*[-–—]\s*(.+?)\s*$/);
    if (match) {
        return { artist: match[1].trim(), name: match[2].trim(), album: "" };
    }
    return { name: base || fileName, artist: "", album: "" };
}

function decodeUtf8(bytes: Uint8Array): string {
    try {
        return new TextDecoder("utf-8").decode(bytes);
    } catch {
        return decodeLatin1(bytes);
    }
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
    try {
        return new TextDecoder(littleEndian ? "utf-16le" : "utf-16be").decode(bytes);
    } catch {
        let out = "";
        for (let i = 0; i + 1 < bytes.length; i += 2) {
            const code = littleEndian ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1];
            out += String.fromCharCode(code);
        }
        return out;
    }
}

function decodeLatin1(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
        out += String.fromCharCode(bytes[i]);
    }
    return out;
}

function clean(value: string): string {
    return value.replace(/\u0000+$/g, "").trim();
}

/** ID3v2 文本帧：首字节是编码标识 */
function decodeId3Text(frame: Uint8Array): string {
    if (frame.length === 0) return "";
    const encoding = frame[0];
    const body = frame.subarray(1);
    if (encoding === 0) return clean(decodeLatin1(body));
    if (encoding === 3) return clean(decodeUtf8(body));
    if (encoding === 1) {
        if (body.length >= 2 && body[0] === 0xff && body[1] === 0xfe) return clean(decodeUtf16(body.subarray(2), true));
        if (body.length >= 2 && body[0] === 0xfe && body[1] === 0xff)
            return clean(decodeUtf16(body.subarray(2), false));
        return clean(decodeUtf16(body, true));
    }
    if (encoding === 2) return clean(decodeUtf16(body, false));
    return clean(decodeLatin1(body));
}

function syncSafeToInt(bytes: Uint8Array, offset: number): number {
    return (
        ((bytes[offset] & 0x7f) << 21) |
        ((bytes[offset + 1] & 0x7f) << 14) |
        ((bytes[offset + 2] & 0x7f) << 7) |
        (bytes[offset + 3] & 0x7f)
    );
}

function readUintBE(bytes: Uint8Array, offset: number, length: number): number {
    let value = 0;
    for (let i = 0; i < length; i++) {
        value = (value << 8) | bytes[offset + i];
    }
    return value;
}

function readUintLE(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

/** 去掉不合法化：0xFF 0x00 → 0xFF */
function deUnsynchronize(bytes: Uint8Array): Uint8Array {
    const out = new Uint8Array(bytes.length);
    let write = 0;
    for (let read = 0; read < bytes.length; read++) {
        out[write++] = bytes[read];
        if (bytes[read] === 0xff && bytes[read + 1] === 0x00) {
            read++;
        }
    }
    return out.subarray(0, write);
}

function parseId3v2(bytes: Uint8Array): LocalAudioTags | null {
    if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;
    const major = bytes[3];
    const flags = bytes[5];
    const tagSize = syncSafeToInt(bytes, 6);
    const end = Math.min(bytes.length, 10 + tagSize);
    let body = bytes.subarray(10, end);
    if (flags & 0x80) {
        body = deUnsynchronize(body);
    }

    let cursor = 0;
    if (flags & 0x40) {
        if (major >= 4) {
            cursor += syncSafeToInt(body, cursor);
        } else {
            cursor += 4 + readUintBE(body, cursor, 4);
        }
    }

    const result: LocalAudioTags = { name: "", artist: "", album: "" };
    const idLength = major === 2 ? 3 : 4;
    const sizeLength = major === 2 ? 3 : 4;
    const flagLength = major === 2 ? 0 : 2;

    while (cursor + idLength + sizeLength <= body.length) {
        if (body[cursor] === 0) break;
        const id = String.fromCharCode(...body.subarray(cursor, cursor + idLength));
        const size =
            major === 4 ? syncSafeToInt(body, cursor + idLength) : readUintBE(body, cursor + idLength, sizeLength);
        cursor += idLength + sizeLength + flagLength;
        if (size <= 0 || cursor + size > body.length) break;
        const frame = body.subarray(cursor, cursor + size);
        cursor += size;

        if (id === "TIT2" || id === "TT2") result.name = result.name || decodeId3Text(frame);
        else if (id === "TPE1" || id === "TP1") result.artist = result.artist || decodeId3Text(frame);
        else if (id === "TALB" || id === "TAL") result.album = result.album || decodeId3Text(frame);
    }

    return result;
}

function parseId3v1(tail: Uint8Array): LocalAudioTags | null {
    if (tail.length < 128) return null;
    const tag = tail.subarray(tail.length - 128);
    if (tag[0] !== 0x54 || tag[1] !== 0x41 || tag[2] !== 0x47) return null;
    const field = (offset: number, length: number) => clean(decodeLatin1(tag.subarray(offset, offset + length)));
    return { name: field(3, 30), artist: field(33, 30), album: field(63, 30) };
}

function parseVorbisComment(bytes: Uint8Array): LocalAudioTags {
    const result: LocalAudioTags = { name: "", artist: "", album: "" };
    if (bytes.length < 8) return result;
    let cursor = 0;
    const vendorLength = readUintLE(bytes, cursor);
    cursor += 4 + vendorLength;
    if (cursor + 4 > bytes.length) return result;
    const count = readUintLE(bytes, cursor);
    cursor += 4;

    for (let i = 0; i < count && cursor + 4 <= bytes.length; i++) {
        const length = readUintLE(bytes, cursor);
        cursor += 4;
        if (cursor + length > bytes.length) break;
        const entry = decodeUtf8(bytes.subarray(cursor, cursor + length));
        cursor += length;
        const separator = entry.indexOf("=");
        if (separator < 0) continue;
        const key = entry.slice(0, separator).toUpperCase();
        const value = clean(entry.slice(separator + 1));
        if (key === "TITLE" && !result.name) result.name = value;
        else if ((key === "ARTIST" || key === "ALBUMARTIST") && !result.artist) result.artist = value;
        else if (key === "ALBUM" && !result.album) result.album = value;
    }
    return result;
}

function parseFlac(bytes: Uint8Array): LocalAudioTags | null {
    if (bytes.length < 8 || bytes[0] !== 0x66 || bytes[1] !== 0x4c || bytes[2] !== 0x61 || bytes[3] !== 0x43)
        return null;
    let cursor = 4;
    while (cursor + 4 <= bytes.length) {
        const header = bytes[cursor];
        const isLast = (header & 0x80) !== 0;
        const type = header & 0x7f;
        const size = readUintBE(bytes, cursor + 1, 3);
        const start = cursor + 4;
        if (start + size > bytes.length) break;
        if (type === 4) {
            return parseVorbisComment(bytes.subarray(start, start + size));
        }
        cursor = start + size;
        if (isLast) break;
    }
    return null;
}

export async function parseLocalAudioFile(file: File): Promise<LocalAudioTags> {
    const fallback = parseFilenameFallback(file.name);
    try {
        const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
        const tags = parseId3v2(head) || parseFlac(head);

        if (tags) {
            return {
                name: tags.name || fallback.name,
                artist: tags.artist || fallback.artist,
                album: tags.album || fallback.album,
            };
        }

        if (file.name.toLowerCase().endsWith(".mp3") && file.size > 128) {
            const tail = new Uint8Array(await file.slice(file.size - 128).arrayBuffer());
            const v1 = parseId3v1(tail);
            if (v1) {
                return {
                    name: v1.name || fallback.name,
                    artist: v1.artist || fallback.artist,
                    album: v1.album || fallback.album,
                };
            }
        }
    } catch (error) {
        console.warn("解析本地音频元数据失败，回落到文件名", error);
    }
    return fallback;
}

/** 把用户选择的文件批量转换为可播放的本地 Song（自动跳过非音频文件） */
export async function importLocalFiles(files: Iterable<File>): Promise<Song[]> {
    const songs: Song[] = [];
    for (const file of files) {
        if (!isAudioFile(file)) continue;
        const tags = await parseLocalAudioFile(file);
        let localUrl = "";
        try {
            localUrl = URL.createObjectURL(file);
        } catch (error) {
            console.warn("创建本地音频地址失败", error);
            continue;
        }
        songs.push({
            id: localSongId(file),
            name: tags.name || file.name,
            artist: tags.artist,
            album: tags.album,
            source: LOCAL_SOURCE,
            fileName: file.name,
            fileSize: file.size,
            localUrl,
        });
    }
    return songs;
}
