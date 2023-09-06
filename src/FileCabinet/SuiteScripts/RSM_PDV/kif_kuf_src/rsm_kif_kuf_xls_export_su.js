/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(["N/file", 'N/encode', 'N/log'], function (file, encode, log) {

  /**
    * Generate xls file and return it as N/File type
    * @param {object} params Suitelet request parameters (type, from, to)
    * @param {object} data data object representing KIF/KUF transactions grouped by tax code
    * @returns {file.File} NetSuite file.File object of EXCEL type
    */
  function createXlsFile(params, data) {
    var xmlString = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>';
    xmlString += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ';
    xmlString += 'xmlns:o="urn:schemas-microsoft-com:office:office" ';
    xmlString += 'xmlns:x="urn:schemas-microsoft-com:office:excel" ';
    xmlString += 'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" ';
    xmlString += 'xmlns:html="http://www.w3.org/TR/REC-html40">';

    xmlString += '<Worksheet ss:Name="' + params.type + '">';
    xmlString += '<Table>' +
      '<Row>' +
      '<Cell><Data ss:Type="String"> Interni id </Data></Cell>' +
      '<Cell><Data ss:Type="String"> Dokument </Data></Cell>' +
      '<Cell><Data ss:Type="String"> Tip </Data></Cell>' +
      '<Cell><Data ss:Type="String"> Referenca </Data></Cell>' +
      '<Cell><Data ss:Type="String"> Datum transakcije </Data></Cell>' +
      '<Cell><Data ss:Type="String"> POPDV datum </Data></Cell>' +
      '<Cell><Data ss:Type="String"> Kupac/Dobavljac </Data></Cell>' +
      '<Cell><Data ss:Type="String"> PIB </Data></Cell>' +
      '<Cell><Data ss:Type="String"> Tax kod </Data></Cell>' +
      '<Cell><Data ss:Type="String"> Stopa PDV </Data></Cell>' +
      '<Cell><Data ss:Type="String"> Osnovica </Data></Cell>' +
      '<Cell><Data ss:Type="String"> PDV </Data></Cell>' +
      '<Cell><Data ss:Type="String"> Ukupno </Data></Cell>' +
      '</Row>';

    for (var i = 0; i < data.length; i++) {
      xmlString += '<Row><Cell><Data ss:Type="String"> ' + data[i].desc + ' </Data></Cell></Row>';

      for (var j = 0; j < data[i].transactions.length; j++) {
        if (data[i].transactions[j].type === "Deposit Application") {
          for (var k = 0; k < data[i].transactions[j].invoices.length; k++) {
            xmlString += '<Row>' +
              '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].internalid + '</Data></Cell>' +
              '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].tranid + '</Data></Cell>' +
              '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].type + '</Data></Cell>' +
              '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].invoices[k].refnum + '</Data></Cell>' +
              '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].trandate + '</Data></Cell>' +
              '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].popdvdatum + '</Data></Cell>' +
              '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].customer + '</Data></Cell>' +
              '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].pib + '</Data></Cell>' +
              '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].taxcode + '</Data></Cell>' +
              '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].rate + '</Data></Cell>' +
              '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].invoices[k].netamount + '</Data></Cell>' +
              '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].invoices[k].taxamount + '</Data></Cell>' +
              '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].invoices[k].amount + '</Data></Cell>' +
              '</Row>';
          }
        } else if (data[i].transactions[j].type === "Vendor Prepayment Application") {
          for (var k = 0; k < data[i].transactions[j].bills.length; k++) {
            xmlString += '<Row>' +
            '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].internalid + '</Data></Cell>' +
            '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].tranid + '</Data></Cell>' +
            '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].type + '</Data></Cell>' +
            '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].bills[k].refnum + '</Data></Cell>' +
            '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].trandate + '</Data></Cell>' +
            '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].popdvdatum + '</Data></Cell>' +
            '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].customer + '</Data></Cell>' +
            '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].pib + '</Data></Cell>' +
            '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].taxcode + '</Data></Cell>' +
            '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].rate + '</Data></Cell>' +
            '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].bills[k].netamount + '</Data></Cell>' +
            '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].bills[k].taxamount + '</Data></Cell>' +
            '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].bills[k].amount + '</Data></Cell>' +
            '</Row>';
          }
        } else {
          xmlString += '<Row>' +
          '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].internalid + '</Data></Cell>' +
          '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].tranid + '</Data></Cell>' +
          '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].type + '</Data></Cell>' +
          '<Cell><Data ss:Type="String"></Data></Cell>' +
          '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].trandate + '</Data></Cell>' +
          '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].popdvdatum + '</Data></Cell>' +
          '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].customer + '</Data></Cell>' +
          '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].pib + '</Data></Cell>' +
          '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].taxcode + '</Data></Cell>' +
          '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].rate + '</Data></Cell>' +
          '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].amount + '</Data></Cell>' +
          '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].taxamount + '</Data></Cell>' +
          '<Cell><Data ss:Type="String"> ' + data[i].transactions[j].grossamount + '</Data></Cell>' +
          '</Row>';
        }
      }
      xmlString += '<Row>' +
        '<Cell><Data ss:Type="String"></Data></Cell>' +
        '<Cell><Data ss:Type="String"></Data></Cell>' +
        '<Cell><Data ss:Type="String"></Data></Cell>' +
        '<Cell><Data ss:Type="String"></Data></Cell>' +
        '<Cell><Data ss:Type="String"></Data></Cell>' +
        '<Cell><Data ss:Type="String"></Data></Cell>' +
        '<Cell><Data ss:Type="String"></Data></Cell>' +
        '<Cell><Data ss:Type="String"></Data></Cell>' +
        '<Cell><Data ss:Type="String"></Data></Cell>' +
        '<Cell><Data ss:Type="String"></Data></Cell>' +
        '<Cell><Data ss:Type="String"> ' + data[i].nettotal + '</Data></Cell>' +
        '<Cell><Data ss:Type="String"> ' + data[i].taxtotal + '</Data></Cell>' +
        '<Cell><Data ss:Type="String"> ' + data[i].total + '</Data></Cell>' +
        '</Row>';
    }
    xmlString += '</Table></Worksheet></Workbook>';

    // Create and return file
    var xlsFile = file.create({
      name: params.type + '_' + params.from + '_' + params.to + ".xls",
      fileType: file.Type.EXCEL,
      contents: encode.convert({
        string: xmlString,
        inputEncoding: encode.Encoding.UTF_8,
        outputEncoding: encode.Encoding.BASE_64
      })
    });
    return xlsFile;
  }

  // Suitelet entry point function
  function onRequest(context) {
    if (context.request.method === "GET") {
      var dataFile = file.load({
        id: context.request.parameters.fileid
      });
      var data = JSON.parse(dataFile.getContents());

      var params = {
        type: context.request.parameters.type,
        from: context.request.parameters.popdvdatefrom,
        to: context.request.parameters.popdvdateto
      }

      var xlsFile = createXlsFile(params, data);
      context.response.writeFile(xlsFile);

    } else {
      context.response.write("404");
    }
  }

  return {
    onRequest: onRequest
  };

});
