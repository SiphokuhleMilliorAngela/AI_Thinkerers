import os from 'node:os'

export const systemTools = {
  'system.info': async () => ({
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
    user: os.userInfo().username,
    homeDir: os.homedir(),
  }),
  'system.network': async () => os.networkInterfaces(),
}
