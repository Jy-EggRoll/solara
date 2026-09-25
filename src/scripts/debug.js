/**
 * 共享调试日志单例。
 *
 * 供 app.js 与拆分出的会话模块（session.js）复用，避免把日志器留在装配中心
 * 而导致「装配中心 ↔ 子模块」循环依赖。
 */
import { createDebugLogger } from "./visual/spotlight.js";
import { state } from "./state.js";
import { dom } from "./dom.js";

export const debugLog = createDebugLogger(state, dom);
