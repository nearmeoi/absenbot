module.exports = {
  apps : [{
    name   : "absenbot",
    script : "index.js",
    watch: false,
    max_memory_restart: '1G',
    restart_delay: 30000,
    exp_backoff_restart_delay: 100,
    env: {
      NODE_ENV: "production",
    },
    error_file: "logs/pm2-error.log",
    out_file: "logs/pm2-out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    merge_logs: true
  }]
}
