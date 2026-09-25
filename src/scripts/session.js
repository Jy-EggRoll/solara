/**
 * 会话与持久化编排（自 app.js 拆出，保持零循环依赖：本模块不反向 import app.js）。
 *
 * 职责：播放/收藏状态的本地保存、当前曲目信息与封面加载、就绪待播状态切换。
 */
import { isMobileLayout } from "./core/viewport.js";
import { API } from "./constants.js";
import { dom } from "./dom.js";
import { state } from "./state.js";
import { safeSetLocalStorage, preferHttpsUrl } from "./core/storage.js";
import { showAlbumCoverPlaceholder, setAlbumCoverImage, scheduleDeferredPaletteUpdate } from "./visual/aurora.js";
import { updateFavoriteIcons, updateFavoriteHighlight } from "./features/favorites.js";
import { updatePlaylistHighlight } from "./features/playlist.js";
import { cancelPendingPlayback, updatePlayPauseButton, updateProgressBarBackground } from "./core/audio.js";
import { clearLyricsContent } from "./features/lyrics.js";
import { debugLog } from "./debug.js";

const isMobileView = isMobileLayout();

// 状态保存快捷方法
export function savePlayerState(options = {}) {
    const { skipRemote = false } = options;
    safeSetLocalStorage("playlistSongs", JSON.stringify(state.playlistSongs), { skipRemote });
    safeSetLocalStorage("currentTrackIndex", String(state.currentTrackIndex), { skipRemote });
    safeSetLocalStorage("playMode", state.playMode, { skipRemote });
    safeSetLocalStorage("playbackQuality", state.playbackQuality, { skipRemote });
    safeSetLocalStorage("playerVolume", String(state.volume), { skipRemote });
    safeSetLocalStorage("currentPlaylist", state.currentPlaylist, { skipRemote });
    safeSetLocalStorage("currentList", state.currentList, { skipRemote });
    if (state.currentSong) {
        safeSetLocalStorage("currentSong", JSON.stringify(state.currentSong), { skipRemote });
    } else {
        safeSetLocalStorage("currentSong", "", { skipRemote });
    }
    safeSetLocalStorage("currentPlaybackTime", String(state.currentPlaybackTime || 0), { skipRemote });
}

export function saveFavoriteState(options = {}) {
    const { skipRemote = false } = options;
    safeSetLocalStorage("favoriteSongs", JSON.stringify(state.favoriteSongs), { skipRemote });
    safeSetLocalStorage("currentFavoriteIndex", String(state.currentFavoriteIndex), { skipRemote });
    safeSetLocalStorage("favoritePlayMode", state.favoritePlayMode, { skipRemote });
    safeSetLocalStorage("favoritePlaybackTime", String(state.favoritePlaybackTime || 0), { skipRemote });
}

// 封面图片前端内存持久缓存
const coverPicMemoryCache = new Map();

// 歌曲信息更新
export async function updateCurrentSongInfo(song, options = {}) {
    const { loadArtwork = true } = options;
    if (!song) {
        dom.currentSongTitle.textContent = "选择一首歌曲开始播放";
        dom.currentSongArtist.textContent = "未知艺术家";
        showAlbumCoverPlaceholder(dom, state);
        updateFavoriteIcons(state, dom);
        return;
    }

    dom.currentSongTitle.textContent = song.name || "未知歌曲";
    dom.currentSongArtist.textContent = Array.isArray(song.artist)
        ? song.artist.join(" / ")
        : song.artist || "未知艺术家";

    if (loadArtwork) {
        try {
            const cacheKey = `${song.source || "netease"}_${song.pic_id || song.id}`;
            const isDirectUrl = (val) =>
                typeof val === "string" &&
                (val.startsWith("http://") || val.startsWith("https://") || val.startsWith("//"));

            // 1. 优先命中前端内存缓存（0 网络请求）
            if (coverPicMemoryCache.has(cacheKey)) {
                const finalPicUrl = coverPicMemoryCache.get(cacheKey);
                debugLog(`[封面缓存] 命中内存缓存，无需请求网络`);
                setAlbumCoverImage(finalPicUrl, dom, state);
                scheduleDeferredPaletteUpdate(finalPicUrl, state, dom, {}, debugLog);
            }
            // 2. 歌曲本身自带直接可用的图片 URL（如雷达抓取到的数据），直接使用并存入缓存
            else if (isDirectUrl(song.pic)) {
                const finalPicUrl = preferHttpsUrl(song.pic);
                coverPicMemoryCache.set(cacheKey, finalPicUrl);
                setAlbumCoverImage(finalPicUrl, dom, state);
                scheduleDeferredPaletteUpdate(finalPicUrl, state, dom, {}, debugLog);
            }
            // 3. pic_id 本身就是图片 URL
            else if (isDirectUrl(song.pic_id)) {
                const finalPicUrl = preferHttpsUrl(song.pic_id);
                coverPicMemoryCache.set(cacheKey, finalPicUrl);
                setAlbumCoverImage(finalPicUrl, dom, state);
                scheduleDeferredPaletteUpdate(finalPicUrl, state, dom, {}, debugLog);
            }
            // 4. 确实没有直链时，才向后端请求 types=pic 解析
            else if (song.pic_id) {
                const picUrl = API.getPicUrl(song);
                debugLog(`[封面请求] 解析接口: ${picUrl}`);
                const picData = await API.fetchJson(picUrl, debugLog);
                if (picData && picData.url) {
                    const finalPicUrl = preferHttpsUrl(picData.url);
                    coverPicMemoryCache.set(cacheKey, finalPicUrl);
                    setAlbumCoverImage(finalPicUrl, dom, state);
                    scheduleDeferredPaletteUpdate(finalPicUrl, state, dom, {}, debugLog);
                } else {
                    showAlbumCoverPlaceholder(dom, state);
                }
            } else {
                showAlbumCoverPlaceholder(dom, state);
            }
        } catch (e) {
            console.warn("加载封面失败:", e);
            showAlbumCoverPlaceholder(dom, state);
        }
    }

    // 实时同步主播放界面爱心状态与列表收藏标记
    updateFavoriteIcons(state, dom);
}

let pendingArtworkTimer = null;

// 将某一首歌曲设为就绪待播状态（纯本地UI更新，不发起任何音频/歌词网络请求，避免连删时 API 洪峰）
export function setSongAsPending(song, index, listType = "playlist") {
    cancelPendingPlayback();

    if (!song) return;

    if (dom.audioPlayer) {
        try {
            dom.audioPlayer.pause();
            dom.audioPlayer.removeAttribute("src");
            dom.audioPlayer.src = "";
            dom.audioPlayer.load();
        } catch (e) {
            console.warn("停止音频播放异常:", e);
        }
    }

    state.isPlaying = false;
    state.currentSong = song;
    state.currentAudioUrl = null;
    state.currentPlaybackTime = 0;
    state.lastSavedPlaybackTime = 0;
    state.currentList = listType;
    state.currentPlaylist = listType === "favorite" ? "favorites" : "playlist";

    if (listType === "favorite") {
        state.currentFavoriteIndex = index;
        state.favoritePlaybackTime = 0;
        state.favoriteLastSavedPlaybackTime = 0;
        updateFavoriteHighlight(state, dom);
    } else {
        state.currentTrackIndex = index;
        updatePlaylistHighlight(state, dom);
    }

    // 重置进度条
    if (dom.progressBar) {
        dom.progressBar.value = 0;
        dom.progressBar.max = 0;
        updateProgressBarBackground(dom, 0, 1);
    }
    if (dom.currentTimeDisplay) dom.currentTimeDisplay.textContent = "00:00";
    if (dom.durationDisplay) dom.durationDisplay.textContent = "00:00";

    // 播放按钮重置为待播（播放图标）
    updatePlayPauseButton(dom);

    // 纯本地文字更新，0 次网络 API
    if (dom.currentSongTitle) dom.currentSongTitle.textContent = song.name || "未知歌曲";
    if (dom.currentSongArtist) {
        dom.currentSongArtist.textContent = Array.isArray(song.artist)
            ? song.artist.join(" / ")
            : song.artist || "未知艺术家";
    }

    // 同步爱心图标
    updateFavoriteIcons(state, dom);

    // 清空歌词（待播期间不发歌词 API）
    clearLyricsContent(state, dom, isMobileView);

    // 封面防抖加载（400ms）：连删时多次触发会被自动清空，停手后才为最终曲目拉取 1 次
    if (pendingArtworkTimer) {
        clearTimeout(pendingArtworkTimer);
        pendingArtworkTimer = null;
    }
    pendingArtworkTimer = setTimeout(() => {
        if (state.currentSong && state.currentSong === song) {
            updateCurrentSongInfo(song, { loadArtwork: true });
        }
    }, 400);

    savePlayerState();
}
