/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/file', 'N/encode', 'N/render', 'N/log'], function (record, file, encode, render, log) {

  /**
   * Generate xls file and return it as N/File type
   * @param {object} params Suitelet request parameters (type, from, to)
   * @param {object} data data object representing KIF/KUF transactions grouped by tax code
   * @returns {file.File} NetSuite file.File object of EXCEL type
   */
  function createXlsFile(params, data) {
    var reportType = (params.type === 'kif') ? "PDF EVIDENCIJA IZLAZNIH RACUNA" : "PDF EVIDENCIJA ULAZNIH RACUNA";

    var subsidiaryRecord = record.load({
      type: record.Type.SUBSIDIARY,
      id: params.subsidiaryid,
      isDynamic: true
    });

    var companyName = subsidiaryRecord.getValue({
      fieldId: 'legalname'
    });
    var addrSubRec = subsidiaryRecord.getSubrecord('mainaddress');
    var address = addrSubRec.getValue({
      fieldId: 'addr1'
    });
    var city = addrSubRec.getValue({
      fieldId: 'city'
    });
    var pib = subsidiaryRecord.getValue({
      fieldId: 'federalidnumber'
    });

    var jsonData = { 
      "groups": data.outputArray,
      "customerDeposits" : data.customerDepositsArray,
      "reporttype": params.type,
      "companyname": companyName,
      "companyaddress": address,
      "pib": pib,
      "period": params.from + ' - ' + params.to
    };

    var xmlTemplate = file.load({ id: './kif_kuf_templates/rsm_kif_kuf_excel_template.xml' });
    var content = xmlTemplate.getContents();

    var templateRenderer = render.create();
    templateRenderer.templateContent = content;

    templateRenderer.addCustomDataSource({
      format: render.DataSource.JSON,
      alias: "JSON",
      data: JSON.stringify(jsonData)
    });

    var xmlString = templateRenderer.renderAsString();

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
        to: context.request.parameters.popdvdateto,
        subsidiaryid: context.request.parameters.subsidiaryid
      };

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
