/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */
define(["N/render", "N/config", "N/log", "N/file", './popdvUtil', 'N/record'], function (render, config, log, file, popdvUtil, record) {

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
    var popdvScheme = popdvUtil.getPopdvScheme();

    popdvUtil.populatePopdvScheme(popdvScheme, dateStart, dateEnd, subsidiaryId);

    replaceKeysInObj(popdvScheme, "_");


    // TODO: izvuci companyInfo iz subsidiary record-a i adresu iz adress subrecord-a
    // Read company name

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
      id: './popdv_pdf_html_template.xml'
    });

    var renderer = render.create();
    renderer.addCustomDataSource({
      format: render.DataSource.OBJECT,
      alias: "JSON",
      data: jsonObj
    });
    renderer.templateContent = templateFile.getContents();

    context.response.writeFile(renderer.renderAsPdf(), true);
    // context.response.write({
    //   output: JSON.stringify(popdvUtil.creditMemoJournalEntriesSS('10.12.2016', '10.12.2016'))
    // });
  }

  return {
    onRequest: onRequest
  };

});
