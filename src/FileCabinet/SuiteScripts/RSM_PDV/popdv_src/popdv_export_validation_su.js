/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */
define(["N/render", "N/config", "N/log", "N/file", './popdvValidationUtilv2', 'N/record', 'N/file', 'N/encode'], function (render, config, log, file, popdvValidationUtil, record, file, encode) {

  /**
   * Replaces key names in an object with a new values
   * @param {object} obj
   * @param {string} prefix
   */
  function replaceKeysInObj(obj, prefix) {
    for (var key in obj) {
      if (key.substr(0, 1) !== prefix) {
        var value = obj[key];
        obj[prefix + key] = value;
        delete obj[key];

        if (typeof value === "object") {
          replaceKeysInObj(value, prefix);
        }
      }
    }
  }

  // Suitelet entry-point function
  function onRequest(context) {
    var dateStart = context.request.parameters.datestart,
      dateEnd = context.request.parameters.dateend,
      pdfDateStart = context.request.parameters.pdfdatestart,
      pdfDateEnd = context.request.parameters.pdfdateend,
      pib = context.request.parameters.pib,
      subsidiaryId = context.request.parameters.subsidiary;

    // Get and map popdv scheme
    var popdvScheme = popdvValidationUtil.getPopdvScheme();

    popdvValidationUtil.populatePopdvScheme(popdvScheme, dateStart, dateEnd, subsidiaryId);
    log.error('IN EXPORT', JSON.stringify(popdvScheme));
    //replaceKeysInObj(popdvScheme, "_");

    var subsidiaryRecord = record.load({
      type: record.Type.SUBSIDIARY,
      id: subsidiaryId,
      isDynamic: true
    });

    var subsidiaryMainAddress = subsidiaryRecord.getSubrecord('mainaddress');
    var address = subsidiaryMainAddress.getValue({
      fieldId: 'addr1'
    });
    var city = subsidiaryMainAddress.getValue({
      fieldId: 'city'
    });

    var country = subsidiaryMainAddress.getValue({
      fieldId: 'country'
    });
    var zip = subsidiaryMainAddress.getValue({
      fieldId: 'zip'
    });

    var companyName = subsidiaryRecord.getValue({
      fieldId: 'legalname'
    });
    companyName = companyName + ', ' + address + ', ' + city + ' ' + zip + ', ' + country;
    var jsonObj = {
      datestart: pdfDateStart,
      dateend: pdfDateEnd,
      pib: pib,
      firma: companyName,
      popdvObj: popdvScheme
    };

    var templateFile = file.load({
      id: './popdv_validation_xls_template.xml'
    });
    var content = templateFile.getContents();

    var renderer = render.create();
    renderer.templateContent = content;
    renderer.addCustomDataSource({
      format: render.DataSource.JSON,
      alias: "JSON",
      data: JSON.stringify(jsonObj)
    });
    //log.error('TEST', JSON.stringify(jsonObj));
    var xmlString = renderer.renderAsString();

    var xlsFile = file.create({
      name: 'POPDV_Validation_' + companyName +'_za_period_' + dateStart + '-' + dateEnd + '.xls',
      fileType: file.Type.EXCEL,
      contents: encode.convert({
        string: xmlString,
        inputEncoding: encode.Encoding.UTF_8,
        outputEncoding: encode.Encoding.BASE_64
      })
    });

    context.response.writeFile(xlsFile);
  }

  return {
    onRequest: onRequest
  };

});
