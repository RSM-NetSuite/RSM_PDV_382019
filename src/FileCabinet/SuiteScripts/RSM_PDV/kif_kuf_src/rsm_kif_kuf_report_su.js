/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(["N/file", 'N/ui/serverWidget', 'N/render', 'N/record', 'N/log','N/format/i18n'], function (file, serverWidget, render, record, log,format) {

  // Suitelet entry point function
  function onRequest(context) {
    if (context.request.method === "GET") {

      var reportType = context.request.parameters.type,
        from = context.request.parameters.popdvdatefrom,
        to = context.request.parameters.popdvdateto,
        subsidiaryId = context.request.parameters.subsidiaryid;

      var form = serverWidget.createForm({
        title: (reportType === 'kif') ?
          "PDV EVIDENCIJA IZLAZNIH DOKUMENATA" + ' ' + from + ' - ' + to :
          "PDV EVIDENCIJA ULAZNIH DOKUMENATA" + ' ' + from + ' - ' + to
      });

      form.clientScriptModulePath = './rsm_kif_kuf_cs.js';

      form.addButton({
        id: 'exportxls',
        label: "Export to Excel",
        functionName: 'exportToExcel'
      });

      var subsidiaryRecord = record.load({
        type: record.Type.SUBSIDIARY,
        id: subsidiaryId,
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

      var fgMR = form.addFieldGroup({
        id: 'fieldgroupcomp',
        label: 'Podaci o pravnom licu'
      });

      // TODO : Add all required fields
      /**
       * Adding TEXT Field on form
       * - value is not assigned at this moment
       * - container is used for placing field into group
       */
      var fCompanyName = form.addField({
        id: 'custpage_rsm_txt_company_name',
        label: 'Pravno lice',
        type: serverWidget.FieldType.TEXT,
        container: 'fieldgroupcomp'
      });

      var fCompanyAddress = form.addField({
        id: 'custpage_rsm_txt_company_address',
        label: 'Adresa',
        type: serverWidget.FieldType.TEXT,
        container: 'fieldgroupcomp'
      });

      var fCompanyPIB = form.addField({
        id: 'custpage_rsm_txt_company_pib',
        label: 'PIB',
        type: serverWidget.FieldType.TEXT,
        container: 'fieldgroupcomp'
      });
      /**
       * Setting value for the field
       */
      fCompanyName.defaultValue = companyName;
      fCompanyAddress.defaultValue = address + ', ' + city;
      fCompanyPIB.defaultValue = pib;
      /**
       * DisplayType
       * - INLINE = without EDITBOX, label style
       */
      fCompanyName.updateDisplayType({
        displayType: serverWidget.FieldDisplayType.INLINE
      });

      fCompanyAddress.updateDisplayType({
        displayType: serverWidget.FieldDisplayType.INLINE
      });

      fCompanyPIB.updateDisplayType({
        displayType: serverWidget.FieldDisplayType.INLINE
      });

      var fTitle = form.addField({
        id: 'custpage_rsm_txt_title',
        label: 'Naziv izveštaja',
        type: serverWidget.FieldType.TEXT,
        container: 'fieldgroupcomp'
      });

      fTitle.defaultValue = (reportType === 'kif') ?
        "PDV EVIDENCIJA IZLAZNIH DOKUMENATA" :
        "PDV EVIDENCIJA ULAZNIH DOKUMENATA";
      fTitle.updateDisplayType({
        displayType: serverWidget.FieldDisplayType.INLINE
      });

      var reportPeriod = form.addField({
        id: 'custpage_rsm_report_period',
        label: 'Poreski period',
        type: serverWidget.FieldType.TEXT,
        container: 'fieldgroupcomp'
      });
      reportPeriod.defaultValue = from + ' - ' + to;
      reportPeriod.updateDisplayType({
        displayType: serverWidget.FieldDisplayType.INLINE
      });

      var dataFile = file.load({
        id: context.request.parameters.fileid
      });
      // log.error('Check json data',dataFile.getContents());

      var data = JSON.parse(dataFile.getContents());
      // log.error('Check json data 2',data);

      // Create template renderer and render html template
      var overallAmountData = calculateOverallAmounts(data.outputArray,data.customerDepositsArray);
      var jsonData = { "groups": data.outputArray, "customerDeposits": data.customerDepositsArray, "reporttype": reportType ,'overallData':overallAmountData};

      var htmlTemplate = file.load({ id: './kif_kuf_templates/rsm_kif_kuf_html_template.html' });
      var content = htmlTemplate.getContents();

      var templateRenderer = render.create();
      templateRenderer.templateContent = content;

      templateRenderer.addCustomDataSource({
        format: render.DataSource.JSON,
        alias: "JSON",
        data: JSON.stringify(jsonData)
      });

      var htmlString = templateRenderer.renderAsString();
      var fgData = form.addFieldGroup({
        id: 'fieldgroupdata',
        label: 'Tabela'
      });
      var htmlField = form.addField({
        id: 'htmlfield',
        label: 'Report',
        type: serverWidget.FieldType.INLINEHTML,
        container: 'fieldgroupdata'
      });
      htmlField.defaultValue = htmlString;
      // This field is needed to show data table in both columns inside a field group
      form.addField({
        id: 'custpage_hidden_script',
        label: 'hidden script',
        type: serverWidget.FieldType.INLINEHTML
      }).defaultValue = '<script>'
      + 'jQuery(document).ready(function() {'
      + 'jQuery("#tr_fg_fieldgroupdata")'
      + '.find("td").first().attr("width", "98%");'
      + '})'
        + '</script>';


      context.response.writePage(form);

    } else {
      context.response.write("404");
    }
  }

 function calculateOverallAmounts (kifkufData, depData) {
  
  var numFormatter = format.getNumberFormatter();
  
  var overallkifkufTotal = 0
  var overallkifkufNetTotal = 0
  var overallkifkufTaxTotal = 0

  for (var data in kifkufData) {
    overallkifkufTotal += parseInt(kifkufData[data].total)
    overallkifkufNetTotal += parseInt(kifkufData[data].nettotal)
    overallkifkufTaxTotal += parseInt(kifkufData[data].taxtotal)
  }

  var overalldepTotal = 0
  var overalldepNetTotal = 0
  var overalldepTaxTotal = 0

  for (var data in depData) {
    overalldepTotal += parseInt(depData[data].total)
    overalldepNetTotal += parseInt(depData[data].nettotal)
    overalldepTaxTotal += parseInt(depData[data].taxtotal)
  }

  return {
    overallTotal:numFormatter.format({number:overalldepTotal + overallkifkufTotal}),
    overallNetTotal:numFormatter.format({number:overalldepNetTotal + overallkifkufNetTotal}),
    overallTaxTotal:numFormatter.format({number:overalldepTaxTotal + overallkifkufTaxTotal})
    // overallTotal:overalldepTotal + overallkifkufTotal,
    // overallNetTotal:overalldepNetTotal + overallkifkufNetTotal,
    // overallTaxTotal:overalldepTaxTotal + overallkifkufTaxTotal,
  }
}

  return {
    onRequest: onRequest
  };

});
