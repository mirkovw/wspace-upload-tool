# wspace-upload-tool
Command line tool for uploading videos to specific review folders on workspace

## Installation

```sh
npm install wspace-upload-tool
```

## Basic Usage
```js
const WorkspaceUpload = require('wspace-upload-tool');

( async () => {
    const result = await WorkspaceUpload({
        login: {
            user: 'email@domain.com',
            pass: 'password'
        },
        file: './video/video_1920x1080.mp4',
        libraryId: '1234',
        cookies: "./cookies.json",
    });

    if (result.success) {
        console.log('All done')
    } else {
        console.log('Error: ' + result.error.reason)
    }
})();
```