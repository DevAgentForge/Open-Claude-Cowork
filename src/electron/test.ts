import osUtils from "os-utils";
import fs from "fs"
import os from "os"
import { BrowserWindow } from "electron";
import { ipcWebContentsSend } from "./util.js";

const POLLING_INTERVAL = 2000;

// Store interval reference for cleanup
let activePollingInterval: ReturnType<typeof setInterval> | null = null;

export function pollResources(mainWindow: BrowserWindow): ReturnType<typeof setInterval> {
    // Clear any existing interval before starting a new one
    if (activePollingInterval) {
        clearInterval(activePollingInterval);
        activePollingInterval = null;
    }

    const intervalId = setInterval(async () => {
        // Check if window is destroyed BEFORE processing
        if (!mainWindow || mainWindow.isDestroyed()) {
            clearInterval(intervalId);
            activePollingInterval = null;
            return;
        }

        try {
            const cpuUsage = await getCPUUsage();
            const storageData = getStorageData();
            const ramUsage = getRamUsage();

            // Double-check window is still valid before sending
            if (!mainWindow.isDestroyed()) {
                ipcWebContentsSend("statistics", mainWindow.webContents, { cpuUsage, ramUsage, storageData: storageData.usage });
            }
        } catch (error) {
            console.error('[Polling] Error during resource poll:', error);
            // Don't stop polling on error, just log it
        }
    }, POLLING_INTERVAL);

    activePollingInterval = intervalId;
    return intervalId;
}

export function cleanupPolling(intervalId: ReturnType<typeof setInterval> | null): void {
    if (intervalId) {
        clearInterval(intervalId);
    }
    // Also clear the active interval reference
    if (activePollingInterval) {
        clearInterval(activePollingInterval);
        activePollingInterval = null;
    }
}

export function stopPolling(): void {
    if (activePollingInterval) {
        clearInterval(activePollingInterval);
        activePollingInterval = null;
    }
}

export function getStaticData() {
    const totalStorage = getStorageData().total;
    const cpuModel = os.cpus()[0].model;
    const totalMemoryGB = Math.floor(osUtils.totalmem() / 1024);

    return {
        totalStorage,
        cpuModel,
        totalMemoryGB
    }
}

function getCPUUsage(): Promise<number> {
    return new Promise(resolve => {
        osUtils.cpuUsage(resolve);
    })
}

function getRamUsage() {
    return 1 - osUtils.freememPercentage();
}

function getStorageData() {
    const stats = fs.statfsSync(process.platform === 'win32' ? 'C://' : '/');
    const total = stats.bsize * stats.blocks;
    const free = stats.bsize * stats.bfree;

    return {
        total: Math.floor(total / 1_000_000_000),
        usage: 1 - free / total
    }
}
