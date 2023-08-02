//Este código index11.2_cons_unica raw DEU CERTO.js  ou app_index11.2.js é capaz de gerar logs como um array de objetos e devolve a resposta 
//da API como um objeto JSON ou XML, dependendo do tipo de conteúdo da resposta. 
//Além disso, cada log agora é um objeto em vez de uma string, facilitando a visualização
// e manipulação dos logs. O código também incorpora funcionalidades para lidar 
//com diferentes tipos de consultas e resposta de APIs.

//OIIIII lipe tudo bem?     

const express = require('express');
const app = express();
const path = require('path');
const router = express.Router();
const axios = require('axios');
const xml2js = require('xml2js');
const { xml2json } = require('xml-js');
const bodyParser = require('body-parser');
const util = require('util');
const js2xmlparser = require("js2xmlparser");
const { type } = require('os');

app.use(bodyParser.json());

const types = [
    'placa',
    'chassi',
    'renavam',
    'uf',
    'cpf',
    'cnpj'
];

const urlBubbleEndPoint = 'https://cardadosv2.bubbleapps.io/version-test/api/1.1/obj/cadastro_api?descending=false&sort_field=ordem&constraints=';

const getUserProducts = () => {
    const products = {
        decodificador: true,
        novap: true,
        detransc: true,
        detranrs: true,
        detranes: true,
        detrango: true,
        detranms: true,
        detranpe: true,
        detranpb: true,
        vendadireta: true,
        agregados: true,
        historicorf: true,
        proprietariosant: true
    }
    return products;
};

const getContraintsTypesFromQueryParams = async (query) => {
    let typesOnParams = [];
    await types.forEach(type => {
        typesOnParams.push(generateConstraint('tipos', (query[type] ? 'contains' : 'not%20contains'), type));
    });

    return typesOnParams;
};

const getContraintsTypesFromArray = (array) => {
    let typesOnParams = [];
    types.forEach(type => {
        typesOnParams.push(generateConstraint('tipos', array.find(e => e == type) ? 'contains' : 'not%20contains', type));
    });

    return typesOnParams;
};

const getValueTypesFromQueryParams = async (query) => {
    let values = {};

    await (Object.keys(query)).forEach(key => {
        if (types.includes(key)) {
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

const filterData = (data, filter, value) => {
    let dataFilter = [];
    for (let i of data) {
        if (i[filter] === value) {
            dataFilter.push(i);
        }
    }

    // Ordena o array em ordem crescente com base no parâmetro "order"
    dataFilter.sort((a, b) => a.ordem - b.ordem);
    return dataFilter;
};

const capitalize = (string) => {
    return string[0].toUpperCase() + string.slice(1);
}

const callAPI = async (constraint, values) => {

    let url = urlBubbleEndPoint + JSON.stringify(constraint);
    let response = await getData({ method: 'GET', url: url });
    let responseAPI = null;
    let resultData = null;

    for (let i = 0; i < response.data.response.results.length; i++) {
        let api = response.data.response.results[i];
        let apiURL = makeReplaces(api.url, values);
        let method = api.metodo || 'GET';
        let startTimestamp = Date.now();
        let resultResponse = await getData({ method: method, url: apiURL });

        if (responseIsValid(resultResponse, api)) {
            logs = logRequest(apiURL, method, resultResponse, null, api, startTimestamp);
            responseAPI = { res: resultResponse, api: api };
        }
    }
    
    if (responseAPI.res.headers['content-type'].includes('text/xml')) {
        const parser = new xml2js.Parser();
        const result = await util.promisify(parser.parseString)(responseAPI.res.data);
        const logsJSON = JSON.parse(JSON.stringify(logs));
        resultData = buildAPIResponse(result, logsJSON, "JSON");
        resultData = result;
    } else {
        const responseAPIJs = JSON.parse(xml2json(responseAPI.res.data, { spaces: 2, compact: true, number: 2 }));
        const logsJSON = JSON.parse(JSON.stringify(logs));
        resultData = buildAPIResponse(responseAPIJs, logsJSON, "JSON");
    }
    return resultData;
}

function callAPIWithTimeout(constraint, values, timeoutMilliseconds) {
    const apiPromise = callAPI(constraint, values);

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error('Timeout da requisição excedido'));
        }, timeoutMilliseconds);
    });

    return Promise.race([apiPromise, timeoutPromise]);
}

async function getResponsesFromAllAPIs(values, baseNacionalData) {
    const respostas = {};
    const products = getUserProducts();
    const carData = await getData({ method: 'GET', url: 'https://cardadosv2.bubbleapps.io/version-test/api/1.1/obj/cadastro_api' });

    for (const prodcut in products) {
        try {
            let didRequest = false;
            let resposta;
            const carDataFiltered = filterData(carData.data.response.results, 'ambito', prodcut);
            let carDataTypes = [];

            for (let i of carDataFiltered) {
                carDataTypes.push(i.tipos);
            }

            for (let i of carDataTypes) {
                let newConstraint = getContraintsTypesFromArray(i);
                let newValues = {};
                newConstraint.push(generateConstraint('ambito', 'equals', prodcut));
                newConstraint.push(generateConstraint('ativo', 'equals', true));

                for (let j in i) {
                    if (types.find(e => e == i[j])) {
                        const searchType = i[j];
                        newValues[i[j]] = values[searchType] || values[searchType.toUpperCase()] || baseNacionalData[capitalize(searchType)];
                    }
                }
                if (!didRequest) {
                    for (let i in carDataFiltered) {
                        try {
                            // Loop através das propriedades após o filtro do cardados
                            for (let j in carDataFiltered[i]) {
                                if (types.find(type => type == j)) {
                                    const searchType = j;
                                    // Obtém os novos valores para a propriedade do cardados
                                    newValues[j] = values[searchType] || values[searchType.toUpperCase()] || baseNacionalData[capitalize(searchType)];
                                }
                            }

                            const timeoutMilliseconds = 4000;
                            // Faz uma chamada à API com um tempo limite
                            resposta = await callAPIWithTimeout(newConstraint, newValues, timeoutMilliseconds);
                            console.log("fazendo requisição para o" + carDataFiltered[i].ordem);
                            console.log(resposta);
                            didRequest = true;
                        } catch (error) {
                            // Em caso de erro, define a flag como false e fornece uma resposta de erro
                            didRequest = false;
                            resposta = { error: "Serviço indisponível" };
                        }
                    }
                }

                respostas[capitalize(prodcut)] = resposta;
            }
        } catch (error) {
            console.error(`Erro ao obter resposta para o acesso ${prodcut}:`, error);
        }
    }

    return respostas;
}

const responseIsValid = (response, api) => {
    if (response.status != (api.sucesso_status || 200)) {
        return false;
    }

    if (api.sucesso_conter && !response.data.includes(api.sucesso_conter)) {
        return false;
    }

    if (api.erro_conter && response.data.includes(api.erro_conter)) {
        return false;
    }

    return true;
};

const getFormattedDateTime = () => {
    const now = new Date();
    return now.toLocaleString();
};

const logRequest = (apiURL, method, response, error = null, api, startTimestamp) => {
    const endTimestamp = Date.now();
    const executionTime = endTimestamp - startTimestamp;

    const logs = {
        "Log_Ambito": api.ambito || '',
        "consultaUrl": apiURL,
        "codigoConsulta": api._id || '',
        "logErroConsulta": api.erro_conter || '',
        "fornecedor": api.fornecedor || '',
        "dataHora": getFormattedDateTime(),
        "parametro": api.tipos[0] || '',
        "status": response && response.status === 200 ? 200 : '',
        "nomeConsulta": api.ambito || '',
        "tempoExecucao": executionTime + "ms",
        "metodo": response ? response.config.method : '',
        "opcaoCache": api.ativo ? 'true' : 'false',
        "opcaoReativacao": api.ativo ? 'true' : 'false',
        "ordem": api.ordem || '',
        "sucesso_conter": api.sucesso_conter || ''
    };
    return logs;
};

//esse metódo foi criado para removers os .text que eram atribuitos a cada key dentro da response.
const mapJSONWithTextPropRecursive = (json) => {
    if (typeof json !== 'object') {
        return json;
    }

    if ('_text' in json) {
        return json._text;
    }

    for (let key in json) {
        json[key] = mapJSONWithTextPropRecursive(json[key]);
    }

    return json;
}

//o input deve ser JSON
const buildAPIResponse = (apiResponse, logs, outputFormat) => {

    let returnValue = null;
    const result = apiResponse.NewDataSet ? mapJSONWithTextPropRecursive(apiResponse).NewDataSet : mapJSONWithTextPropRecursive(apiResponse);
    try {
        const buildObject = {
            Ambito: result,
            Logs: logs
        }
        switch (outputFormat) {
            case 'JSON':
                returnValue = JSON.parse(JSON.stringify(buildObject));
                break;
            case 'XML':
                returnValue = js2xmlparser.parse("Data", buildObject).replace("<?xml version='1.0'?>", '');
                break;
            default:
                console.log("outputFormat Inválido");
                break;
        }
        return returnValue;
    }
    catch (e) {
        console.log(`Algo deu errado durante o build da response. ${e.message}`);
    }
}
router.post('/buscar/:scope/:cru?', async function (req, res) {
    let constraints = await getContraintsTypesFromQueryParams(req.query);
    let values = await getValueTypesFromQueryParams(req.query);
    const reqType = req.query.reqType;
    products = getUserProducts();

    if (!constraints.length) {
        res.status(422).send({ message: 'Nenhum tipo foi informado para executar o processo' });
        return;
    }

    constraints.push(generateConstraint('ambito', 'equals', req.params.scope));
    constraints.push(generateConstraint('ativo', 'equals', true));

    if (req.query._id) {
        constraints.push(generateConstraint('_id', 'equals', req.query._id));
    }

    try {
        let resultData;
        if (reqType == 'multiple') {
            nacional = await callAPI(constraints, values);
            resultData = await getResponsesFromAllAPIs(values, nacional.Ambito.BaseNacional);
            resultData = { ...nacional, resultData };
        }
        else {
            resultData = await callAPI(constraints, values);
        }

        if (req.params.cru) {
            res.status(200).send({
                responseData: resultData
            });

        } else {
            res.status(200).send({
                responseAPI: {
                    api: responseAPI.api._id,
                    response: {
                        data: resultData,
                        status: responseAPI.res.status,
                        contentType: responseAPI.res.headers['content-type']
                    },
                    logs: logsXML
                }
            });
        }

    } catch (err) {
        console.log(err);
        res.status(500).send({ message: 'Falha ao processar sua requisição' });
    }
});

app.use('/', router);
app.listen(process.env.port || 3015);

console.log('Running at Port 3015');
