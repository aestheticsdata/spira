module.exports = {
  apps: [
    {
      name: 'spira-front',
      cwd: __dirname,
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 3004 -H 127.0.0.1',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: '3004',
        HOST: '127.0.0.1',
        SPIRA_API_URL: 'http://127.0.0.1:6700'
      }
    }
  ]
};
