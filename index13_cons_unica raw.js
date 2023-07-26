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

let logs = []; // Array para armazenar os logs

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
  };
};

const getData = async (configs) => {
  const response = await axios(configs);
  return response;
};

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

  const log = [
    `Log_Ambito: ${api.ambito || ''}`,
    `consultaUrl: ${apiURL}`,
    `codigoConsulta: ${api._id || ''}`,
    `logErroConsulta: ${api.erro_conter || ''}`,
    `fornecedor: ${api.fornecedor || ''}`,
    `dataHora: ${getFormattedDateTime()}`,
    `parametro: ${api.tipos || ''}`,
    `status: ${response && response.status === 200 ? 200 : ''}`,
    `nomeConsulta: ${api.ambito || ''}`,
    `tempoExecucao: ${executionTime}ms`,
    `metodo: ${response ? response.config.method : ''}`,
    `opcaoCache: ${api.ativo ? 'true' : 'false'}`,
    `opcaoReativacao: ${api.ativo ? 'true' : 'false'}`,
    `ordem: ${api.ordem || ''}`,
    `sucesso_conter: ${api.sucesso_conter || ''}`
  ];

  logs.push(log.join('\n')); // Adicionar o log ao array como uma única string separada por quebras de linha

  // Salvar o log em algum lugar, como em um banco de dados ou arquivo de log
  console.log(log.join('\n'));
};

router.post('/buscar/:scope1/:scope2?/:cru?', async function (req, res) {
  let responseAPIs = [];

  const scopes = [req.params.scope1, req.params.scope2];

  for (let j = 0; j < scopes.length; j++) {
    let constrains = await getContraintsTypesFromQueryParams(req.query);
    let values = await getValueTypesFromQueryParams(req.query);

    if (!constrains.length) {
      res.status(422).send({ message: 'Nenhum tipo foi informado para executar o processo' });
      return;
    }

    constrains.push(generateConstraint('ambito', 'equals', scopes[j]));
    constrains.push(generateConstraint('ativo', 'equals', true));

    if (req.query._id) {
      constrains.push(generateConstraint('_id', 'equals', req.query._id));
    }

    try {
      let url = urlBubbleEndPoint + JSON.stringify(constrains);

      console.log('- Buscando APIS em: ' + url);

      let response = await getData({ method: 'GET', url: url });

      console.log('-- Encontradas ' + response.data.response.results.length + ' API`s');

      let responseAPI = null;

      for (let i = 0; i < response.data.response.results.length; i++) {
        let api = response.data.response.results[i];

        let apiURL = makeReplaces(api.url, values);

        let method = api.metodo || 'GET';

        console.log('-- Executando chamada para ' + apiURL + ' com método ' + method);

        const startTimestamp = Date.now();
        let resultResponse = await getData({
          method: method,
          url: apiURL,
        });

        console.log('-- Resposta');
        console.log(resultResponse.data);

        // Registrar o log da consulta
        logRequest(apiURL, method, resultResponse, null, api, startTimestamp);

        if (responseIsValid(resultResponse, api)) {
          responseAPI = { api: api, res: resultResponse };
          break;
        }
      }

      if (responseAPI) {
        responseAPIs.push(responseAPI);
      } else {
        res.status(404)
          .send({
            message: 'Nenhum link foi capaz de atender a requisição',
            logs: logs.join('\n') // Incluir os logs na resposta da API como uma única string separada por quebras de linha
          });
        return;
      }
    } catch (err) {
      console.log(err);

      // Registrar o log da consulta com o erro
      logRequest(url, 'GET', null, err);

      res.status(400).send({
        message: 'Falha ao consultar os links',
        error: err.response,
        logs: logs.join('\n') // Incluir os logs na resposta da API como uma única string separada por quebras de linha
      });
      return;
    }
  }

  if (responseAPIs.length > 0) {
    let responseData = responseAPIs.map(responseAPI => ({
      api: responseAPI.api._id,
      response: {
        data: responseAPI.res.data,
        status: responseAPI.res.status,
        contentType: responseAPI.res.headers['content-type'],
      },
    }));
  
    let logsResponse = logs.join('\n');
  
    let fullResponse = `- Buscando APIS em: ${req.params.scope1}/${req.params.scope2}/${req.params.cru}\n`;
    fullResponse += `-- Encontradas ${responseAPIs.length} API(s)\n`;
  
    for (let i = 0; i < responseData.length; i++) {
      fullResponse += `-- Executando chamada para ${responseData[i].api} com método ${responseData[i].response.method}\n`;
      fullResponse += `-- Resposta\n${responseData[i].response.data}\n`;
    }
  
    fullResponse += `Log_Ambito: ${req.params.scope1}\n`;
    fullResponse += `consultaUrl: ${req.query.url}\n`;
    fullResponse += `codigoConsulta: ${req.query.codigoConsulta}\n`;
    fullResponse += `logErroConsulta: ${req.query.logErroConsulta}\n`;
    fullResponse += `fornecedor: ${req.query.fornecedor}\n`;
    fullResponse += `dataHora: ${req.query.dataHora}\n`;
    fullResponse += `parametro: ${req.query.parametro}\n`;
    fullResponse += `status: ${req.query.status}\n`;
    fullResponse += `nomeConsulta: ${req.query.nomeConsulta}\n`;
    fullResponse += `tempoExecucao: ${req.query.tempoExecucao}\n`;
    fullResponse += `metodo: ${req.query.metodo}\n`;
    fullResponse += `opcaoCache: ${req.query.opcaoCache}\n`;
    fullResponse += `opcaoReativacao: ${req.query.opcaoReativacao}\n`;
    fullResponse += `ordem: ${req.query.ordem}\n`;
    fullResponse += `sucesso_conter: ${req.query.sucesso_conter}\n`;
  
    if (req.params.cru === 'true') {
      res.status(200).json({
        response: responseData[0].response.data,
      });
    } else {
      res.status(200).json({
        response: fullResponse,
      });
    }
  } else {
    res.status(404).json({
      message: 'Nenhum link foi capaz de atender a requisição',
      logs: logs.join('\n'),
    });
  }
});

   

app.use('/', router);

app.listen(3000, () => {
  console.log('Servidor iniciado com sucesso! na porta 3000');
});
