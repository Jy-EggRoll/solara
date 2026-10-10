/**
 * Solara 播放列表核心数据与交互逻辑 (Playlist CRUD, JSON 导入导出, 标签切换)
 */

import { PLAYLIST_EXPORT_VERSION } from "../constants.js";
import { safeSetLocalStorage, preferHttpsUrl } from "../core/storage.js";
import { resetPlayerToIdle, releaseAudioSource } from "../core/audio.js";
import { isLocalSong, revokeLocalSong } from "../core/local-library.js";
import { isMobileLayout } from "../core/viewport.js";
import { debugLog } from "../debug.js";
import { showNotification } from "./settings.js";

export function resolveSongId(rawSong) {
    if (!rawSong || typeof rawSong !== "object") {
        return undefined;
    }
    const candidateKeys = [
        "id",
        "songId",
        "song_id",
        "url_id",
        "mid",
        "musicId",
        "music_id",
        "trackId",
        "track_id",
        "copyrightId",
        "copyright_id",
        "rid",
        "bvid",
    ];
    for (const key of candidateKeys) {
        const val = rawSong[key];
        if (typeof val === "string" && val.trim() !== "") {
            return val.trim();
        }
        if (typeof val === "number" && Number.isFinite(val)) {
            return String(val);
        }
    }
    return undefined;
}

export function normalizeArtistValue(value) {
    if (Array.isArray(value)) {
        const names = value
            .map((item) => {
                if (typeof item === "string") {
                    return item.trim();
                }
                if (item && typeof item === "object" && typeof item.name === "string") {
                    return item.name.trim();
                }
                return "";
            })
            .filter(Boolean);
        return names.length > 0 ? names.join(", ") : undefined;
    }
    if (value && typeof value === "object" && typeof value.name === "string") {
        const name = value.name.trim();
        return name || undefined;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || undefined;
    }
    return undefined;
}

/**
 * 按歌手重排（播放列表与收藏列表共用）。
 *
 * 为什么用稳定排序：同一歌手内保持原有相对顺序，用户手动积累的顺序不会被无谓打乱。
 * 为什么显式比对原始下标：不依赖运行时是否实现了稳定排序，任何环境结果一致。
 * 为什么把空歌手沉底：本地文件常缺内嵌标签，空串参与比较会把整组顺序搅乱。
 */
export function sortSongsByArtist(songs) {
    if (!Array.isArray(songs) || songs.length === 0) {
        return [];
    }

    return songs
        .map((song, index) => ({
            song,
            index,
            // 取值口径与 getSongKey 对齐（artist / artists / singers / singer 依次兜底），
            // 保证“排序用的歌手”与“去重用的歌手”是同一个字段
            artist: normalizeArtistValue(song?.artist ?? song?.artists ?? song?.singers ?? song?.singer) || "",
        }))
        .sort((a, b) => {
            if (!a.artist && !b.artist) return a.index - b.index;
            if (!a.artist) return 1;
            if (!b.artist) return -1;
            // 指定 zh-Hans-CN：中文按拼音、英文按字母，中英混排观感正常；不能依赖宿主默认区域
            const byArtist = a.artist.localeCompare(b.artist, "zh-Hans-CN");
            return byArtist !== 0 ? byArtist : a.index - b.index;
        })
        .map((entry) => entry.song);
}

export function getSongKey(song) {
    if (!song || typeof song !== "object") {
        return null;
    }
    const source =
        typeof song.source === "string" && song.source.trim() !== ""
            ? song.source.trim().toLowerCase()
            : typeof song.platform === "string" && song.platform.trim() !== ""
              ? song.platform.trim().toLowerCase()
              : "netease";
    const id = resolveSongId(song);
    if (id) {
        return `${source}:${id}`;
    }
    const name = typeof song.name === "string" ? song.name.trim().toLowerCase() : "";
    if (!name) {
        return null;
    }
    const artistValue = song.artist ?? song.artists ?? song.singers ?? song.singer;
    let artistText = "";
    if (Array.isArray(artistValue)) {
        artistText = artistValue
            .map((item) => {
                if (typeof item === "string") {
                    return item.trim().toLowerCase();
                }
                if (item && typeof item === "object" && typeof item.name === "string") {
                    return item.name.trim().toLowerCase();
                }
                return "";
            })
            .filter(Boolean)
            .join(",");
    } else if (artistValue && typeof artistValue === "object" && typeof artistValue.name === "string") {
        artistText = artistValue.name.trim().toLowerCase();
    } else if (typeof artistValue === "string") {
        artistText = artistValue.trim().toLowerCase();
    }
    return `${source}:${name}::${artistText}`;
}

export function sanitizeImportedSong(rawSong) {
    if (!rawSong || typeof rawSong !== "object") {
        return null;
    }
    const name = typeof rawSong.name === "string" ? rawSong.name.trim() : "";
    if (!name) {
        return null;
    }

    const normalized = { ...rawSong, name };
    const sourceCandidate = rawSong.source || rawSong.platform || rawSong.provider || rawSong.vendor;
    normalized.source =
        typeof sourceCandidate === "string" && sourceCandidate.trim() !== "" ? sourceCandidate.trim() : "netease";

    const resolvedId = resolveSongId(rawSong);
    if (resolvedId) {
        normalized.id = resolvedId;
    }

    const artistValue = rawSong.artist ?? rawSong.artists ?? rawSong.singers ?? rawSong.singer;
    const normalizedArtist = normalizeArtistValue(artistValue);
    if (normalizedArtist !== undefined) {
        normalized.artist = normalizedArtist;
    }

    if (normalized.album && typeof normalized.album === "object" && typeof normalized.album.name === "string") {
        normalized.album = normalized.album.name.trim();
    }

    return normalized;
}

export function extractPlaylistItems(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }
    if (payload && typeof payload === "object") {
        const possibleKeys = ["items", "songs", "playlist", "tracks", "data"];
        for (const key of possibleKeys) {
            if (Array.isArray(payload[key])) {
                return payload[key];
            }
        }
    }
    return [];
}

export function updatePlaylistActionStates(state, dom) {
    const hasSongs = Array.isArray(state.playlistSongs) && state.playlistSongs.length > 0;
    if (dom.exportPlaylistBtn) {
        dom.exportPlaylistBtn.disabled = !hasSongs;
        dom.exportPlaylistBtn.setAttribute("aria-disabled", hasSongs ? "false" : "true");
    }
    if (dom.mobileExportPlaylistBtn) {
        dom.mobileExportPlaylistBtn.disabled = !hasSongs;
        dom.mobileExportPlaylistBtn.setAttribute("aria-disabled", hasSongs ? "false" : "true");
    }
    if (dom.clearPlaylistBtn) {
        dom.clearPlaylistBtn.disabled = !hasSongs;
        dom.clearPlaylistBtn.setAttribute("aria-disabled", hasSongs ? "false" : "true");
    }
    if (dom.mobileClearPlaylistBtn) {
        dom.mobileClearPlaylistBtn.disabled = !hasSongs;
        dom.mobileClearPlaylistBtn.setAttribute("aria-disabled", hasSongs ? "false" : "true");
    }
    if (dom.sortPlaylistBtn) {
        dom.sortPlaylistBtn.disabled = !hasSongs;
        dom.sortPlaylistBtn.setAttribute("aria-disabled", hasSongs ? "false" : "true");
    }
    if (dom.mobileSortPlaylistBtn) {
        dom.mobileSortPlaylistBtn.disabled = !hasSongs;
        dom.mobileSortPlaylistBtn.setAttribute("aria-disabled", hasSongs ? "false" : "true");
    }
}

/** 按唯一特征（Key / ID）在曲库中定位当前播放曲目，匹配不到时退回既有索引（不做歌名兜底，避免同名不同源的歌曲被错认）。 */
export function findCurrentSongIndex(songs, currentSong, fallbackIndex) {
    const currentKey = getSongKey(currentSong);
    const currentId = currentSong?.id ? String(currentSong.id) : null;

    const matchedIndex = songs.findIndex((song) => {
        const k = getSongKey(song);
        if (currentKey && k && k === currentKey) return true;
        if (currentId && song?.id && String(song.id) === currentId) return true;
        return false;
    });

    if (matchedIndex >= 0) {
        return matchedIndex;
    }
    if (fallbackIndex >= 0 && fallbackIndex < songs.length) {
        return fallbackIndex;
    }
    return -1;
}

/** 播放列表与收藏列表共用：把 .current 高亮落到目标索引上。 */
export function applyCurrentHighlight(items, targetIndex) {
    items.forEach((item, index) => {
        const isCurrent = index === targetIndex;
        item.classList.toggle("current", isCurrent);
        item.setAttribute("aria-current", isCurrent ? "true" : "false");
        item.setAttribute("aria-pressed", isCurrent ? "true" : "false");
    });
}

export function updatePlaylistHighlight(state, dom) {
    if (!dom.playlistItems) return;
    const items = dom.playlistItems.querySelectorAll(".playlist-item");
    if (!items.length) return;

    let targetIndex = -1;
    const isPlayingPlaylist = state.currentPlaylist === "playlist" && state.currentSong != null;

    if (isPlayingPlaylist && Array.isArray(state.playlistSongs) && state.playlistSongs.length > 0) {
        targetIndex = findCurrentSongIndex(state.playlistSongs, state.currentSong, state.currentTrackIndex);
        // 自动纠偏当前索引，确保状态与视图完全一致
        if (targetIndex >= 0) state.currentTrackIndex = targetIndex;
    }

    applyCurrentHighlight(items, targetIndex);
}

export function renderPlaylist(state, dom, callbacks = {}) {
    if (!dom.playlistItems) return;

    if (!Array.isArray(state.playlistSongs) || state.playlistSongs.length === 0) {
        if (dom.playlist) dom.playlist.classList.add("empty");
        dom.playlistItems.innerHTML = "";
        if (typeof callbacks.savePlayerState === "function") callbacks.savePlayerState();
        if (typeof callbacks.updateFavoriteIcons === "function") callbacks.updateFavoriteIcons();
        updatePlaylistHighlight(state, dom);
        if (typeof callbacks.updateMobileClearPlaylistVisibility === "function")
            callbacks.updateMobileClearPlaylistVisibility();
        updatePlaylistActionStates(state, dom);
        return;
    }

    if (dom.playlist) dom.playlist.classList.remove("empty");
    const playlistHtml = state.playlistSongs
        .map((song, index) => {
            const artistValue = Array.isArray(song.artist) ? song.artist.join(", ") : song.artist || "未知艺术家";
            const songKey = getSongKey(song) || `playlist-${index}`;
            return `
        <div class="playlist-item" data-index="${index}" role="button" tabindex="0" aria-label="播放 ${song.name}" data-favorite-key="${songKey}">
            <div class="playlist-item-info">
                <span class="playlist-item-title">${song.name}</span>
                <span class="playlist-item-artist"> - ${artistValue}</span>
            </div>
            <div class="playlist-item-actions" role="toolbar" aria-label="歌曲操作">
                <button class="playlist-item-favorite favorite-toggle" type="button" data-playlist-action="favorite" data-index="${index}" data-favorite-key="${songKey}" title="收藏" aria-label="收藏">
                    <i class="fa-regular fa-heart"></i>
                </button>
                <button class="playlist-item-download" type="button" data-playlist-action="download" data-index="${index}" title="下载" aria-label="下载">
                    <i class="fas fa-download"></i>
                </button>
                <button class="playlist-item-share" type="button" data-playlist-action="share" data-index="${index}" title="分享" aria-label="分享">
                    <i class="fas fa-share-alt"></i>
                </button>
                <button class="playlist-item-remove" type="button" data-playlist-action="remove" data-index="${index}" title="从播放列表移除" aria-label="从播放列表移除">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>`;
        })
        .join("");

    dom.playlistItems.innerHTML = playlistHtml;
    if (typeof callbacks.savePlayerState === "function") callbacks.savePlayerState();
    if (typeof callbacks.updateFavoriteIcons === "function") callbacks.updateFavoriteIcons();
    updatePlaylistHighlight(state, dom);
    if (typeof callbacks.updateMobileClearPlaylistVisibility === "function")
        callbacks.updateMobileClearPlaylistVisibility();
    updatePlaylistActionStates(state, dom);
}

export function switchLibraryTab(target, dom, callbacks = {}) {
    const showFavorites = target === "favorites";

    if (Array.isArray(dom.libraryTabs) && dom.libraryTabs.length > 0) {
        dom.libraryTabs.forEach((tab) => {
            if (!(tab instanceof HTMLElement)) {
                return;
            }
            const tabTarget = tab.dataset.target === "favorites" ? "favorites" : "playlist";
            const isActive = showFavorites ? tabTarget === "favorites" : tabTarget === "playlist";
            tab.classList.toggle("active", isActive);
            tab.setAttribute("aria-selected", isActive ? "true" : "false");
        });
    }

    if (dom.playlist) {
        if (showFavorites) {
            dom.playlist.classList.remove("active");
            dom.playlist.setAttribute("hidden", "");
        } else {
            dom.playlist.classList.add("active");
            dom.playlist.removeAttribute("hidden");
        }
    }

    if (dom.favorites) {
        if (showFavorites) {
            dom.favorites.classList.add("active");
            dom.favorites.removeAttribute("hidden");
        } else {
            dom.favorites.classList.remove("active");
            dom.favorites.setAttribute("hidden", "");
        }
    }

    if (typeof callbacks.updateMobileLibraryActionVisibility === "function") {
        callbacks.updateMobileLibraryActionVisibility(showFavorites);
    }
    if (typeof callbacks.updateMobileClearPlaylistVisibility === "function") {
        callbacks.updateMobileClearPlaylistVisibility();
    }
    if (typeof callbacks.closeImportSelectedMenu === "function") {
        callbacks.closeImportSelectedMenu();
    }
}

export function removeFromPlaylist(index, state, dom, callbacks = {}) {
    if (!Array.isArray(state.playlistSongs) || index < 0 || index >= state.playlistSongs.length) {
        return;
    }

    // 1. 立即中断并作废所有在途排队的异步播放网络请求
    if (typeof callbacks.cancelPendingPlayback === "function") {
        callbacks.cancelPendingPlayback();
    }

    const removingSong = state.playlistSongs[index];
    const removingKey = getSongKey(removingSong);
    const currentKey = state.currentSong ? getSongKey(state.currentSong) : null;

    // 判断是否删除了当前正在播放/停留的歌曲（支持 key 比对、id 比对、名称+歌手比对以及索引匹配）
    const isSameSong = Boolean(
        (removingKey && currentKey && removingKey === currentKey) ||
        (removingSong?.id && state.currentSong?.id && String(removingSong.id) === String(state.currentSong.id)) ||
        (removingSong?.name && state.currentSong?.name && removingSong.name === state.currentSong.name),
    );
    const removingCurrent = (state.currentPlaylist === "playlist" && state.currentTrackIndex === index) || isSameSong;

    // 2. 从本地数组中安全移除
    state.playlistSongs.splice(index, 1);
    window.__solaraDebugLog?.(
        `[播放列表] 移除曲目: ${removingSong.name || "未知歌曲"} (剩余: ${state.playlistSongs.length} 首)`,
    );

    // 3. 场景 A：列表已经被彻底删空了
    if (state.playlistSongs.length === 0) {
        state.currentTrackIndex = -1;
        window.__solaraDebugLog?.(`[播放列表] 列表已被清空，自动重置为空闲待机态`);
        // 只要列表删空，或删掉的是当前播放的歌，播放器必须彻底停止发声并回到空闲态
        if (removingCurrent || state.currentPlaylist === "playlist" || isSameSong) {
            if (typeof callbacks.resetPlayerToIdle === "function") {
                callbacks.resetPlayerToIdle();
            } else {
                resetPlayerToIdle(state, dom, callbacks);
            }
        }
        // 音频元素已停止并清空 src，可以安全回收该曲目的 blob 直链
        revokeLocalSong(removingSong);
        renderPlaylist(state, dom, callbacks);
        if (typeof callbacks.clearLyricsIfLibraryEmpty === "function") {
            callbacks.clearLyricsIfLibraryEmpty();
        }
        showNotification("已从播放列表移除", "success", dom);
        return;
    }

    // 4. 场景 B：列表还有歌，且删除了当前正在播放的歌曲
    if (removingCurrent) {
        // 第一时间停止当前声音，释放旧音频（必须走共享释放函数，别在这里写 el.src = ""）
        releaseAudioSource(dom);

        // 计算顶上来的新索引
        let targetIndex = index;
        if (targetIndex >= state.playlistSongs.length) {
            targetIndex = state.playlistSongs.length - 1;
        }
        state.currentTrackIndex = targetIndex;
        renderPlaylist(state, dom, callbacks);

        // 顶上来的曲目纯本地就绪待播（不发音频/歌词网络请求，零 API 开销）
        const nextSong = state.playlistSongs[targetIndex];
        window.__solaraDebugLog?.(`[播放列表] 顶上来待播曲目: ${nextSong.name} (索引: ${targetIndex})`);
        if (typeof callbacks.setSongAsPending === "function") {
            callbacks.setSongAsPending(nextSong, targetIndex, "playlist");
        }
        // 被移除的当前曲目已暂停并清空 src，回收其 blob 直链
        revokeLocalSong(removingSong);
        showNotification("已从播放列表移除", "success", dom);
        return;
    }

    // 5. 场景 C：删除的是非当前播放歌曲
    if (state.currentPlaylist === "playlist" && state.currentTrackIndex > index) {
        state.currentTrackIndex--;
    }

    // 删除的不是当前播放曲目，blob 直链可直接回收
    revokeLocalSong(removingSong);
    renderPlaylist(state, dom, callbacks);
    if (typeof callbacks.clearLyricsIfLibraryEmpty === "function") {
        callbacks.clearLyricsIfLibraryEmpty();
    }
    showNotification("已从播放列表移除", "success", dom);
}

export function clearPlaylist(state, dom, callbacks = {}) {
    if (!Array.isArray(state.playlistSongs) || state.playlistSongs.length === 0) {
        return;
    }

    if (typeof callbacks.cancelPendingPlayback === "function") {
        callbacks.cancelPendingPlayback();
    }

    // 检查当前是否正在播放属于播放列表的歌曲
    const currentKey = state.currentSong ? getSongKey(state.currentSong) : null;
    const isPlayingFromPlaylist =
        state.currentPlaylist === "playlist" ||
        (currentKey && state.playlistSongs.some((song) => getSongKey(song) === currentKey)) ||
        (state.currentSong?.id &&
            state.playlistSongs.some((song) => String(song.id) === String(state.currentSong.id))) ||
        (state.currentSong?.name && state.playlistSongs.some((song) => song.name === state.currentSong.name));

    const oldCount = state.playlistSongs.length;
    // 本地曲目的 blob 直链只存活于会话内，清空列表时必须显式回收，否则文件内存会一直驻留
    const localSongsToRevoke = state.playlistSongs.filter((song) => isLocalSong(song));
    state.playlistSongs = [];
    state.currentTrackIndex = -1;
    window.__solaraDebugLog?.(`[播放列表] 全部清空: 移除了 ${oldCount} 首歌曲`);

    if (isPlayingFromPlaylist) {
        if (typeof callbacks.resetPlayerToIdle === "function") {
            callbacks.resetPlayerToIdle();
        } else {
            resetPlayerToIdle(state, dom, callbacks);
        }
    }

    // 播放器已停止后再回收，避免释放正在播放的资源
    localSongsToRevoke.forEach((song) => revokeLocalSong(song));

    renderPlaylist(state, dom, callbacks);
    if (typeof callbacks.clearLyricsIfLibraryEmpty === "function") {
        callbacks.clearLyricsIfLibraryEmpty();
    }
    showNotification("已清空播放列表", "success", dom);
}

/** 一键按歌手重排播放列表。只改数组与索引，不触碰音频元素，正在播放的歌曲不会被打断。 */
export function sortPlaylistByArtist(state, dom, callbacks = {}) {
    if (!Array.isArray(state.playlistSongs) || state.playlistSongs.length === 0) {
        return;
    }

    state.playlistSongs = sortSongsByArtist(state.playlistSongs);

    // 列表索引是位置绑定的：重排后必须让索引跟着当前曲目走，否则“下一首”会从错误的歌开始
    if (state.currentPlaylist === "playlist" && state.currentSong) {
        const matched = findCurrentSongIndex(state.playlistSongs, state.currentSong, state.currentTrackIndex);
        if (matched >= 0) state.currentTrackIndex = matched;
    }

    // renderPlaylist 内部会落盘（callbacks.savePlayerState）并刷新高亮
    renderPlaylist(state, dom, callbacks);
    showNotification("已按歌手排序", "success", dom);
}

export function exportPlaylist(state, dom) {
    if (!Array.isArray(state.playlistSongs) || state.playlistSongs.length === 0) {
        showNotification("播放列表为空，无法导出", "warning", dom);
        return;
    }

    // 本地音乐依赖会话内的 blob 直链，无法随文件迁移，导出时剔除
    const exportableSongs = state.playlistSongs.filter((song) => !isLocalSong(song));
    if (exportableSongs.length === 0) {
        showNotification("播放列表中没有可导出的在线歌曲", "warning", dom);
        return;
    }

    try {
        const payload = {
            version: PLAYLIST_EXPORT_VERSION,
            type: "solara_playlist",
            timestamp: new Date().toISOString(),
            songs: exportableSongs,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Solara_Playlist_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showNotification("播放列表已成功导出", "success", dom);
    } catch (e) {
        console.error("导出播放列表失败:", e);
        showNotification("导出失败，请稍后重试", "error", dom);
    }
}

export function handleImportPlaylistChange(event, state, dom, callbacks = {}) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const text = typeof reader.result === "string" ? reader.result : "";
            if (!text) {
                throw new Error("EMPTY_FILE");
            }

            const payload = JSON.parse(text);
            if (!payload) {
                throw new Error("INVALID_JSON");
            }

            const items = extractPlaylistItems(payload);
            if (!Array.isArray(items) || items.length === 0) {
                throw new Error("NO_SONGS");
            }

            if (!Array.isArray(state.playlistSongs)) {
                state.playlistSongs = [];
            }

            const existingKeys = new Set(
                state.playlistSongs.map(getSongKey).filter((key) => typeof key === "string" && key !== ""),
            );

            let added = 0;
            let duplicates = 0;

            items.forEach((raw) => {
                const song = sanitizeImportedSong(raw);
                if (!song) return;
                const key = getSongKey(song);
                if (key && existingKeys.has(key)) {
                    duplicates++;
                    return;
                }
                state.playlistSongs.push(song);
                if (key) existingKeys.add(key);
                added++;
            });

            if (added > 0) {
                if (typeof callbacks.savePlayerState === "function") callbacks.savePlayerState();
                if (typeof callbacks.renderPlaylist === "function") callbacks.renderPlaylist();
                const duplicateHint = duplicates > 0 ? `（${duplicates} 首已存在跳过）` : "";
                showNotification(`成功导入 ${added} 首歌曲${duplicateHint}`, "success", dom);
            } else {
                showNotification("文件中的歌曲已全部存在于播放列表", "warning", dom);
            }
        } catch (error) {
            console.error("导入播放列表失败:", error);
            showNotification("导入失败，请检查文件格式是否有效", "error", dom);
        } finally {
            if (input) {
                input.value = "";
            }
        }
    };

    reader.onerror = () => {
        console.error("读取播放列表文件失败:", reader.error);
        showNotification("无法读取所选文件", "error", dom);
        if (input) {
            input.value = "";
        }
    };

    reader.readAsText(file, "utf-8");
}

/* ─── 分享单曲链接 ───
 * 链接把歌曲的少量身份字段编码进 hash（#s=...），因此不需要任何后端存储：
 * 静态托管下也能直接打开。hash 只在载入时消费一次，随即被清除，
 * 否则用户刷新页面会把同一首歌重复插进播放列表。
 */

const SHARE_LINK_VERSION = 1;
const SHARE_HASH_PREFIX = "#s=";

/** 把 JSON 编成 base64url；先经 TextEncoder 取 UTF-8 字节，避免 btoa 不能处理中文 */
function encodeBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(encoded) {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const remainder = padded.length % 4;
    const binary = atob(remainder ? padded + "=".repeat(4 - remainder) : padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

/** 生成分享链接；本地音乐（或缺少歌名/ID）返回空串，由调用方给出提示 */
export function buildSongShareUrl(song, locationLike) {
    const target = locationLike || (typeof window !== "undefined" ? window.location : null);
    if (!song || typeof song !== "object" || !target) return "";
    const id = resolveSongId(song) || "";
    const name = typeof song.name === "string" ? song.name : "";
    if (!id || !name) return "";
    const payload = {
        v: SHARE_LINK_VERSION,
        i: id,
        n: name,
        a: Array.isArray(song.artist) ? song.artist.join(", ") : song.artist || "",
        al: song.album || "",
        s: song.source || "",
        p: song.pic_id || "",
        l: song.lyric_id || "",
        u: song.url_id || "",
    };
    let encoded = "";
    try {
        encoded = encodeBase64Url(JSON.stringify(payload));
    } catch (error) {
        debugLog("分享链接编码失败:", error);
        return "";
    }
    return `${target.origin}${target.pathname}${SHARE_HASH_PREFIX}${encoded}`;
}

/** 解析 hash 中的分享载荷；任何字段缺失或版本不符都返回 null，由调用方静默忽略 */
export function decodeSongShareHash(hash) {
    if (typeof hash !== "string" || !hash.startsWith(SHARE_HASH_PREFIX)) return null;
    try {
        const payload = JSON.parse(decodeBase64Url(hash.slice(SHARE_HASH_PREFIX.length)));
        if (!payload || payload.v !== SHARE_LINK_VERSION) return null;
        const id = typeof payload.i === "string" ? payload.i.trim() : "";
        const name = typeof payload.n === "string" ? payload.n.trim() : "";
        if (!id || !name) return null;
        const song = {
            id,
            name,
            artist: typeof payload.a === "string" ? payload.a : "",
            album: typeof payload.al === "string" ? payload.al : "",
            source: typeof payload.s === "string" && payload.s ? payload.s : "netease",
        };
        if (payload.p) song.pic_id = payload.p;
        if (payload.l) song.lyric_id = payload.l;
        if (payload.u) song.url_id = payload.u;
        return song;
    } catch (error) {
        debugLog("分享链接解析失败:", error);
        return null;
    }
}

/** 清除 hash：replaceState 不触发跳转，也避免刷新时重复入列 */
function clearShareHash() {
    try {
        const { pathname, search } = window.location;
        window.history.replaceState(window.history.state, "", `${pathname}${search}`);
    } catch (error) {
        debugLog("清除分享 hash 失败:", error);
    }
}

/**
 * 启动时消费 #s= 载荷：已在列表则定位，不在则追加到末尾，然后设为待播。
 * 解析失败只写 debug 日志，不打扰用户。
 */
export function applySharedSongFromHash(state, dom, callbacks = {}) {
    if (typeof window === "undefined" || !window.location) return null;
    const hash = window.location.hash || "";
    if (!hash.startsWith(SHARE_HASH_PREFIX)) return null;

    const song = decodeSongShareHash(hash);
    clearShareHash();
    if (!song) {
        debugLog("忽略无法解析的分享链接:", hash);
        return null;
    }

    if (!Array.isArray(state.playlistSongs)) state.playlistSongs = [];
    const key = getSongKey(song);
    let index = state.playlistSongs.findIndex((item) => getSongKey(item) === key);
    const alreadyExists = index !== -1;
    if (alreadyExists) {
        debugLog("分享的歌曲已在播放列表中，定位到下标:", index);
    } else {
        state.playlistSongs.push(song);
        index = state.playlistSongs.length - 1;
    }

    if (typeof callbacks.setSongAsPending === "function") {
        callbacks.setSongAsPending(song, index, "playlist");
    }
    renderPlaylist(state, dom, callbacks);
    showNotification("已载入分享的歌曲", "success", dom);
    return { song, index, alreadyExists };
}

/** 复制文本：优先 Clipboard API，失败回退临时 textarea + execCommand */
async function copyTextToClipboard(text) {
    if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
    ) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            debugLog("剪贴板写入失败，回退到 execCommand:", error);
        }
    }
    if (typeof document === "undefined") return false;
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "readonly");
        textarea.style.position = "fixed";
        textarea.style.top = "-1000px";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
    } catch (error) {
        debugLog("execCommand 复制失败:", error);
        return false;
    }
}

/**
 * 分享入口（播放列表按钮与播放区按钮共用）。
 * 返回 "local" | "shared" | "copied" | "cancelled" | "failed"，便于测试断言。
 */
export async function shareSongLink(song, dom) {
    if (!song) return "failed";
    if (isLocalSong(song)) {
        showNotification("本地音乐无法分享", "warning", dom);
        return "local";
    }
    const url = buildSongShareUrl(song);
    if (!url) {
        showNotification("复制失败", "error", dom);
        return "failed";
    }

    if (isMobileLayout() && typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
            await navigator.share({ title: song.name, url });
            return "shared";
        } catch (error) {
            // 用户取消系统面板不算错误，其余情况继续走复制
            if (error && error.name === "AbortError") return "cancelled";
            debugLog("系统分享失败，回退到复制链接:", error);
        }
    }

    const copied = await copyTextToClipboard(url);
    if (copied) {
        showNotification("分享链接已复制", "success", dom);
        return "copied";
    }
    showNotification("复制失败", "error", dom);
    return "failed";
}
