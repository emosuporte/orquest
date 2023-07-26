//oi

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
        typesOnParams.push(generateConstraint('tipos', (query[type] ? 'contains' : 'not%20contains'), type));
    });

    return typesOnParams;
};

const getValueTypesFromQueryParams = async (query) => {

    let values = {};

    await (Object.keys(query)).forEach(key => {
        if(types.includes(key))
        {
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

    if(response.status != (api.sucesso_status || 200))
    {
        return false;
    }

    if(api.sucesso_conter && ! response.data.includes(api.sucesso_conter))
    {
        return false;
    }

    if(api.erro_conter && response.data.includes(api.erro_conter))
    {
        return false;
    }

    return true;
};

router.post('/buscar/:scope1/:scope2/:cru?', async function(req, res) {

    let responseAPIs = [];

    const scopes = [req.params.scope1, req.params.scope2];

    for(let j = 0; j < scopes.length; j++) {
        let constrains = await getContraintsTypesFromQueryParams(req.query);
        let values = await getValueTypesFromQueryParams(req.query);

        if( ! constrains.length)
        {
            res.status(422).send({message: 'Nenhum tipo foi informado para executar o processo'});

            return;
        }

        constrains.push(generateConstraint('ambito', 'equals', scopes[j]));
        constrains.push(generateConstraint('ativo', 'equals', true));

        if(req.query._id)
        {
            constrains.push(generateConstraint('_id', 'equals', req.query._id));
        }

        try
        {
            let url = urlBubbleEndPoint + JSON.stringify(constrains);

            console.log('- Buscando APIS em: ' + url);

            let response = await getData({method: 'GET', url: url});

            console.log('-- Encontradas ' + response.data.response.results.length + ' API`s');

            let responseAPI = null;

            for (let i = 0; i < response.data.response.results.length; i++)
            {
                let api = response.data.response.results[i];

                let apiURL = makeReplaces(api.url, values);

                let method = api.metodo || 'GET';

                console.log('-- Executando chamada para ' + apiURL + ' com metodo ' + method);

                let resultResponse = await getData({
                    method: method,
                    url: apiURL,
                });

                console.log('-- Resposta');
                console.log(resultResponse.data);

                if(responseIsValid(resultResponse, api))
                {
                    responseAPI = {api: api, res: resultResponse};

                    break;
                }
            }

            if(responseAPI)
            {
                responseAPIs.push(responseAPI);
            }
            else
            {
                res.status(404)
                    .send({
                        message: 'Nenhum link foi capaz de atender a requisição',
                    });
                return;
            }
        }
        catch(err)
        {
            console.log(err);

            res.status(400).send({
                message: 'Falha ao consultar os links',
                error: err.response
            });
            return;
        }
    }

    if(req.params.cru)
    {
        res.status(200).send(responseAPIs.map(responseAPI => responseAPI.res.data));
    }
    else
    {
        res.status(200).send(responseAPIs.map(responseAPI => ({
            api: responseAPI.api._id,
            response: {
                data: responseAPI.res.data,
                status: responseAPI.res.status,
                contentType: responseAPI.res.headers['content-type'],
            }
        })));
    }
});

app.use('/', router);

app.listen(3000, () => {
    console.log('Servidor iniciado com sucesso! na porta 3000');
});
