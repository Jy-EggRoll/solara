/**
 * 由脚本挂到 window 上的全局契约：存量 JS 负责写入，TS 负责读取。
 * 新出现的 window 属性补到这里，不要在业务文件里用 any 绕过。
 */

interface Window {
    /** 调试浮层日志（js/visual/spotlight.js 注入） */
    __solaraDebugLog?: (message: string) => void;
}
