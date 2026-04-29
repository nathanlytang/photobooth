module.exports = {
  apps: [{
    name: 'photobooth',
    script: 'node',
    args: '--import tsx server/index.ts',
    cwd: __dirname,
    // Restart on crash with 3s delay to avoid rapid restart loops
    autorestart: true,
    restart_delay: 3000,
    // Restart if memory exceeds 400MB (Raspberry Pi 4 safety)
    max_memory_restart: '400M',
    // Keep 10 unstable restarts before stopping
    max_restarts: 10,
    min_uptime: '10s',
    // Environment
    env: {
      NODE_ENV: 'production',
    },
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    // Watch (disabled in prod — use pm2 restart photobooth to apply changes)
    watch: false,
  }],
};
