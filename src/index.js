const axios = require('axios');
const FormData = require('form-data');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const fs = require('fs-extra');
const path = require('path');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

module.exports = async (params) => {
    const cookiesPath = path.resolve(params.cookies);
    const getFileData = (url) => {
        return {
            path: url,
            data: fs.createReadStream(url),
            size: fs.statSync(url),
            name: path.basename(url),
            nameWithoutExt: path.basename(url).split('.').slice(0, -1).join('.')
        }
    }

    const file = getFileData(params.file); // 3rd command line arg should be the filename
    const libraryId = params.libraryId; // 3rd command line arg should be the filename
    let dom, userId, csrfToken, finalLoginUrl, res;

    //setting up cookiejar support for Axios - needed to store and use cookies across requests
    axiosCookieJarSupport(axios);
    const cookieJar = new tough.CookieJar();

    console.log('Checking if cookies.json exists...')
    if (await fs.pathExists(cookiesPath)) {
        console.log('Found. Importing cookies')
        let cookieData = await fs.readFile(cookiesPath);
        cookieJar._importCookies(JSON.parse(cookieData)); //deserialize function is not available. not going to adjust source...
    } else {
        console.log('Not found. Logging in with data from settings.json')
    }
    const uploadUrl = "https://workspace.mediamonks.com/backend/project-folder/materials-upload?id=" + libraryId;

    const config = {
        // proxy: { // charles proxy used for debugging. comment out before publishing
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

    const login = async () => {
        //get userId and id
        try {
            console.log("POST: https://sso-api.theasset.store/api/Accounts/login");
            const res = await axios.post(
                'https://sso-api.theasset.store/api/Accounts/login',
                {
                    "email": params.login.user,
                    "password": params.login.pass
                },
                config
            );

            userId = res.data.userId;
            config.headers = {
                ...config.headers,
                'Authorization': res.data.id
            }
        } catch (err) {
            if (err.response) {
                if (err.response.data) {
                    if (err.response.data.error) {
                        // console.log(err.response.data.error)
                        return {
                            success: false,
                            error: {
                                reason: err.response.data.error
                            }
                        }
                    }

                }
            }
        }

        // get get loginUrl
        try {
            console.log("GET: https://sso-api.theasset.store/api/Accounts/issueTempToken?redirectUrl=https%3A%2F%2Fworkspace.mediamonks.com");
            const res = await axios.get('https://sso-api.theasset.store/api/Accounts/issueTempToken?redirectUrl=https%3A%2F%2Fworkspace.mediamonks.com', config);
            finalLoginUrl = res.data.loginUrl;
        } catch (err) { }

        // get _csrf cookie set
        try {
            console.log("GET: " + finalLoginUrl);
            await axios.get(finalLoginUrl, config);
        } catch (err) { }

    }

    if (cookieJar.toJSON().cookies.length < 2) {
        await login();
    }

    // get csrf token for upload, fish it from the dom
    try {
        console.log("GET: " + uploadUrl);
        res = await axios.get(uploadUrl, config);
    }
    catch (err) {
        if (err.response) {
            if (err.response.status === 302) {
                console.log('ERROR: Got redirected to ' + err.response.headers['x-redirect'] + '. Cookies may be out of date. Logging in again...');
                await login();

                try {
                    console.log("GET: " + uploadUrl);
                    res = await axios.get(uploadUrl, config);
                } catch (err) {
                    //console.log('Still not working for some reason. Contact your administrator ;) ');
                    return {
                        success: false,
                        error: {
                            reason: 'Still not working for some reason. Contact your administrator ;) '
                        }
                    }
                }
            }
        }
    }

    dom = new JSDOM(res.data);

    try {
        csrfToken = dom.window.document.querySelector('[name="_csrf"]').getAttribute("value");
        console.log('Succes. CSRF token = ' + csrfToken)
    } catch (err) {
        //console.log("Logged in successfully, but still can't find _csrf token in the result data. Cancelling upload..");
        return {
            success: false,
            error: {
                reason: "Logged in successfully, but still can't find _csrf token in the result data. Cancelling upload.."
            }
        };
    }

    console.log('Writing cookies to file..');
    const cookies = cookieJar.toJSON();
    let cookie_data = JSON.stringify(cookies, null, 2);
    await fs.writeFile(cookiesPath, cookie_data);


    // upload file
    const data = new FormData();
    data.append('_csrf', csrfToken)
    data.append('UploadForm[files]', file.data)

    config.headers = {
        ...config.headers,
        ...data.getHeaders()
    }

    try {
        console.log("POST: " + uploadUrl);
        const res = await axios.post(uploadUrl, data, config);
        console.log('Upload succesful.')
        return {
            success: true
        }
    }

    catch (err) {
        //console.log('error uploading');
        return {
            success: false,
            error: {
                reason: 'error uploading'
            }
        }
    }

};