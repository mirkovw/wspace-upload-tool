const axios = require('axios');
const settings = require('../settings.json');
const FormData = require('form-data');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const fs = require('fs-extra');
const path = require('path');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

(async () => {

    const getFileData = (url) => {
        return {
            path: url,
            data: fs.createReadStream(url),
            size: fs.statSync(url),
            name: path.basename(url),
            nameWithoutExt: path.basename(url).split('.').slice(0, -1).join('.')
        }
    }

    const file = getFileData(process.argv[2]); // 3rd command line arg should be the filename
    const libraryId = process.argv[3]; // 3rd command line arg should be the filename
    let dom, userId, csrfToken, finalLoginUrl;

    //setting up cookiejar support for Axios - needed to store and use cookies across requests
    axiosCookieJarSupport(axios);
    const cookieJar = new tough.CookieJar();

    const uploadUrl = "https://workspace.mediamonks.com/backend/project-folder/materials-upload?id=" + libraryId;

    const config = {
        // proxy: {
        //     host: 'localhost',
        //     port: 8888
        // },
        headers: {
           'x-requested-with': 'XMLHttpRequest' //somehow it needs this. otherwise it redirects
        },
        withCredentials: true,
        // maxRedirects: 0,
        jar: cookieJar
    };


    //get userId and id
    try {
        const res = await axios.post(
            'https://sso-api.theasset.store/api/Accounts/login',
            {
                "email": settings.login,
                "password": settings.password
            },
            config
        );

        userId = res.data.userId;
        config.headers = {
            ...config.headers,
            'Authorization': res.data.id
        }
    } catch (err) { }

    // get get loginUrl
    try {
        const res = await axios.get('https://sso-api.theasset.store/api/Accounts/issueTempToken?redirectUrl=https%3A%2F%2Fworkspace.mediamonks.com', config);
        finalLoginUrl = res.data.loginUrl;
    } catch (err) { }

    // get _csrf cookie set
    try {
        await axios.get(finalLoginUrl, config);
    } catch (err) { }


    // get csrf token for upload, fish it from the dom
    try {
        const res = await axios.get(uploadUrl, config);
        dom = new JSDOM(res.data);
        csrfToken = dom.window.document.querySelector('[name="_csrf"]').getAttribute("value");
    }
    catch (err) { }


    // upload file
    const data = new FormData();
    data.append('_csrf', csrfToken)
    data.append('UploadForm[files]', file.data)

    config.headers = {
        ...config.headers,
        ...data.getHeaders()
    }

    try {
        const res = await axios.post(uploadUrl, data, config);
        console.log('Succes!')
    }

    catch (err) {
        console.log('error uploading');
    }

})();