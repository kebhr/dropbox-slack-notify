const express = require('express');
const app = express();
const port = 30000;

const fs = require('fs');
const https = require('https');

const helmet = require('helmet');
const bodyParser = require('body-parser');

const Dropbox = require('dropbox').Dropbox;
const fetch = require('isomorphic-fetch');

const axios = require('axios');

require('dotenv').config();

app.use(helmet());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/**
 * Verification request
 */
app.get('/webhook', (req, res) => {
    res.set({
        'Content-Type': 'text/plain',
        'X-Content-Type-Options': 'nosniff'
    });

    res.send(req.query.challenge);
});

/**
 * Receiving notifications
 */
app.post('/webhook', (req, res) => {
    console.log(req.body);

    const cursor = fs.readFileSync('cursor.txt', 'utf8');

    const dbx = new Dropbox({
        accessToken: process.env.DROPBOX_ACCESS_TOKEN,
        fetch: fetch
    });

    dbx.filesListFolderContinue({ cursor: cursor }).then(response => {
        response.entries.forEach(ref => {
            console.log(ref);

            Promise.all([getType(ref[".tag"]), getModifier(dbx, ref)]).then(result => {
                let text = '';
                if (result[1] === undefined) {
                    text = '\`' + ref.path_display.slice(6) + '\` が' + result[0] + 'されました。'
                } else {
                    text = '\`' + ref.path_display.slice(6) + '\` が ' + result[1] + ' によって' + result[0] + 'されました。'
                }

                axios.post(process.env.SLACK_WEBHOOK_URL, JSON.stringify({
                    username: 'Dropbox',
                    text: text
                }));
            });
        });
        fs.writeFileSync('cursor.txt', response.cursor);
    }).catch(error => {
        console.log(error);
    });

    res.send('');

});

const options = {
    key: fs.readFileSync(process.env.KEY_PATH),
    cert: fs.readFileSync(process.env.CERT_PATH),
    ca: [fs.readFileSync(process.env.CA_PATH), fs.readFileSync(process.env.FULLCHAIN_PATH)]
};

https.createServer(options, app).listen(port, () => {
    console.log('Listening...');
});

function getType(type) {
    return new Promise((resolve, reject) => {
        if (type === 'file') resolve('更新');
        if (type === 'folder') resolve('作成');
        if (type === 'deleted') resolve('削除');
    });
}

function getModifier(dbx, ref) {
    return new Promise((resolve, reject) => {
        if (ref.sharing_info === undefined) {
            resolve();
        } else if (ref.sharing_info.modified_by === undefined) {
            resolve();
        }

        dbx.usersGetAccount({ account_id: ref.sharing_info.modified_by }).then(res => {
            resolve(res.name.display_name);
        });
    });
}
