require('alexa-app-server').start({
    app_dir: 'apps',
    app_root: '/',
    port: process.env.PORT || 8001
});
