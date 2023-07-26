const axios = require('axios');
const express = require('express');
const app = express();

app.use(express.json());

const urlBubbleEndPoint =
  'https://cardadosv2.bubbleapps.io/version-test/api/1.1/obj/cadastro_api?descending=false&sort_field=ordem&constraints=';

app.post('/buscar/:placa', async (req, res) => {
  const ambientes = req.body.ambientes;
  const placa = req.params.placa;

  const resultados = await Promise.all(
    ambientes.map(async (ambiente) => {
      const consultaURL = `${urlBubbleEndPoint}${ambiente}&placa=${placa}`;
      const resposta = await axios.get(consultaURL);
      return { ambiente, resposta: resposta.data };
    })
  );

  res.json(resultados);
});

app.listen(3000, () => {
  console.log('Servidor iniciado com sucesso!');
});
