const express = require('express');
const app = express();
const path = require('path');
const router = express.Router();
const axios = require('axios');

const types = [
    'placa',
    'chassi',
    'renavam',
    'uf',
    'cpf',
    'cnpj',
];

const urlBubbleEndPoint = 'https://cardadosv2.bubbleapps.io/version-test/api/1.1/obj/cadastro_api?descending=false&sort_field=ordem&constraints=';

const getContraintsTypesFromQueryParams = async (query) => {
    let typesOnParams = [];
    await types.forEach(type => {
        if (query[type]) {
            typesOnParams.push(generateConstraint('tipos', 'contains', type));
        }
    });

    return typesOnParams;
};

const getValueTypesFromQueryParams = async (query) => {
    let values = {};

    await (Object.keys(query)).forEach(key => {
        if(types.includes(key)) {
            values[key] = query[key];
        }
    });

    return values;
};

const makeReplaces = (subject, obj) => {
    Object.keys(obj).forEach((key) => {
        subject = subject.replace(`{{!${key}!}}`, obj[key]);
    });

    return subject;
};

const generateConstraint = (key, constraint_type, value) => {
    return {
        key,
        constraint_type,
        value
    }
};

const getData = async (configs) => {
    const response = await axios(configs);
    return response;
};

const responseIsValid = (response, api) => {
    if(response.status != (api.sucesso_status || 200)) {
        return false;
    }

    if(api.sucesso_conter && ! response.data.includes(api.sucesso_conter)) {
        return false;
    }

    if(api.erro_conter && response.data.includes(api.erro_conter)) {
        return false;
    }

    return true;
};

router.post('/buscar/:scope/:cru?', async function(req, res) {
    let constrains = await getContraintsTypesFromQueryParams(req.query);
    let values = await getValueTypesFromQueryParams(req.query);

    if( ! constrains.length) {
        res.status(422).send({message: 'Nenhum tipo foi informado para executar o processo'});
        return;
    }

    constrains.push(generateConstraint('ambito', 'equals', req.params.scope));
    constrains.push(generateConstraint('ativo', 'equals', true));

    if(req.query._id) {
        constrains.push(generateConstraint('_id', 'equals', req.query._id));
    }

    try {
        let url = urlBubbleEndPoint + JSON.stringify(constrains);

        console.log('- Buscando APIS em: ' + url);

        let response = await getData({method: 'GET', url: url});

        console.log('-- Encontradas ' + response.data.response.results.length + ' API`s');

        let responseAPI = null;

        for (let i = 0; i < response.data.response.results.length; i++) {
            let api = response.data.response.results[i];

            let apiURL = makeReplaces(api.url, values);

            let method = api.metodo || 'GET';

            console.log('-- Executando chamada para ' + apiURL + ' com metodo ' + method);

            let resultResponse = await getData({
                method: method,
                url: apiURL,
                headers: { 'User-Agent': 'Mozilla/5.0' },
            });

            console.log('-- Resposta');
            console.log(resultResponse.data);

            // Adicionar log
            console.log(`consultaUrl: ${apiURL}`);
            console.log(`codigoConsulta: ${api._id || ''}`);
            console.log(`logErroConsulta: ${api.erro_conter || ''}`);
            console.log(`fornecedor: ${api.fornecedor || ''}`);
            console.log(`dataHora: ${getFormattedDateTime()}`);
            console.log(`parametro: ${api.tipos || ''}`);
            console.log(`status: ${responseIsValid(resultResponse, api) ? 200 : ''}`);
            console.log(`nomeConsulta: ${api.ambito || ''}`);
            console.log(`tempoExecucao: ${getFormattedExecutionTime(resultResponse)}`);
            console.log(`metodo: ${method}`);
            console.log(`opcaoCache: ${api.ativo ? 'true' : 'false'}`);
            console.log(`opcaoReativacao: ${api.ativo ? 'true' : 'false'}`);
            console.log(`ordem: ${api.ordem || ''}`);
            console.log(`sucesso_conter: ${api.sucesso_conter || ''}`);

            if(responseIsValid(resultResponse, api)) {
                responseAPI = {api: api, res: resultResponse};
                break;
            }
        }

        if(responseAPI) {
            if(req.params.cru) {
                res.status(200).send(responseAPI.res.data)
            } else {
                res.status(200).send({
                    api: responseAPI.api._id,
                    response: {
                        data: responseAPI.res.data,
                        status: responseAPI.res.status,
                        contentType: responseAPI.res.headers['content-type'],
                    }
                });
            }
        } else {
            res.status(404).send({
                message: 'Nenhum link foi capaz de atender a requisição',
            });
        }
    } catch(err) {
        console.log(err);
        res.status(400).send({
            message: 'Falha ao consultar os links',
            error: err.message || 'Unknown error'
        });
    }
});

app.use('/', router);

app.listen(3000, () => {
    console.log('Servidor iniciado com sucesso! na porta 3000');
});

function getFormattedDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function getFormattedExecutionTime(response) {
    if (response) {
        const requestTimestamp = response.config.requestTimestamp || 0;
        const responseTimestamp = response.config.responseTimestamp || 0;
        const executionTime = responseTimestamp - requestTimestamp;
        return `${executionTime}ms`;
    }
    return '';
}
