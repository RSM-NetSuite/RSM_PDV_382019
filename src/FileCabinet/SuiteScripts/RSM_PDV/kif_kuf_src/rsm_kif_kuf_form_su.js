/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount 
 */
define(['N/ui/serverWidget', 'N/search', 'N/file', 'N/render', 'N/url', 'N/log'],

  function (serverWidget, search, file, render, url, log) {

    /**
     * Loads html template and renders it with custom record data
     * @returns {string} Rendered html template
     */
    function createKifKufDataList() {
      // Create and run saved search of custom kif kuf data records
      var results = search.create({
        type: "customrecord_kif_kuf_data",
        filters:
        [
        ],
        columns:
        [
            search.createColumn({name: "internalid", label: "Internal ID"}),
            search.createColumn({name: "name", label: "Name"}),
            search.createColumn({name: "custrecord_report_type", label: "Report Type"}),
            search.createColumn({name: "custrecord_popdv_date_from", label: "POPDV datum od"}),
            search.createColumn({name: "custrecord_popdv_date_to", label: "POPDV datum do"}),
            search.createColumn({
              name: "custrecord_created_at",
              sort: search.Sort.ASC,
              label: "Date Created"
            }),
            search.createColumn({name: "custrecord_file_document", label: "Datoteka"}),
            search.createColumn({name: "custrecord_kif_kuf_data_subsidiary", label: "Subsidiary"}),
            search.createColumn({name: "custrecord_kif_kuf_data_user", label: "Korisnik"})
        ]
      }).run();

      var data = [];
      results.each(function (result) {
        var suiteletParams = {
          internalid: result.getValue('internalid'),
          type: result.getValue('custrecord_report_type'),
          fileid: result.getValue('custrecord_file_document'),
          popdvdatefrom: result.getValue('custrecord_popdv_date_from'),
          popdvdateto: result.getValue('custrecord_popdv_date_to'),
          subsidiaryid: result.getValue('custrecord_kif_kuf_data_subsidiary')
        };

        // TODO MILAN ovde se kreira link koji vodi ka izvestaju
        var reportSuiteletUrl = url.resolveScript({
          scriptId: 'customscript_kif_kuf_report_su',
          deploymentId: 'customdeploy_kif_kuf_report_su',
          params: suiteletParams
        });
        var exportXlsSuiteletUrl = url.resolveScript({
          scriptId: 'customscript_rsm_kifkuf_export_xls_v2',
          deploymentId: 'customdeploy_rsm_kifkuf_export_xls_v2',
          params: suiteletParams
        });
        var deleteRecordSuiteletUrl = url.resolveScript({
          scriptId: 'customscript_kif_kuf_delete_su',
          deploymentId: 'customdeploy_kif_kuf_delete_su',
          params: suiteletParams
        });

        data.push({
          internalid: result.getValue('internalid'),
          name: result.getValue('name'),
          type: result.getValue('custrecord_report_type'),
          from: result.getValue('custrecord_popdv_date_from'),
          to: result.getValue('custrecord_popdv_date_to'),
          createdat: result.getValue('custrecord_created_at'),
          file: result.getValue('custrecord_file_document'),
          user: result.getValue('custrecord_kif_kuf_data_user'),
          subsidiary: result.getText('custrecord_kif_kuf_data_subsidiary'),
          reportsuiteleturl: reportSuiteletUrl,
          exportXlsSuiteletUrl: exportXlsSuiteletUrl,
          deleteRecordSuiteletUrl: deleteRecordSuiteletUrl
        });
        return true;
      });

      var htmlTemplate = file.load({ id: './kif_kuf_templates/rsm_kif_kuf_data_html_template.html' });
      var content = htmlTemplate.getContents();

      var templateRenderer = render.create();
      templateRenderer.templateContent = content;

      templateRenderer.addCustomDataSource({
        format: render.DataSource.JSON,
        alias: "JSON",
        data: JSON.stringify({ data: data })
      });

      return templateRenderer.renderAsString();
    }

    /**
     * Creates and runs a subsidiary saved search
     * @returns {object} returns custom object with keys as internalid's of subsidiaries and values as object with subsidiary props
     */
    function getSubsidiaries() {
      var results = search.create({
        type: 'subsidiary',
        filters: [],
        columns: [
          'internalid',
          'name',
          'country'
        ]
      }).run();

      var obj = {};
      results.each(function (result) {
        obj[result.getValue('internalid')] = {
          internalid: result.getValue('internalid'),
          name: result.getValue('name'),
          country: result.getValue('country')
        }
        return true;
      });

      return obj;
    }

    /**
     * Creates a form, adds fields and buttons to it and returns it
     * @returns {serverWidget.Form} Netsuite Form encapsulation object
     */
    function createForm() {
      var form = serverWidget.createForm({
        title: "PDV EVIDENCIJA ULAZNIH/IZLAZNIH DOKUMENATA"
      });

      form.clientScriptModulePath = './rsm_kif_kuf_cs.js';
      // Select field (KIF/KUF) 
      var selectKufKif = form.addField({
        id: 'kifkufselect',
        label: "Tip izvestaja:",
        type: serverWidget.FieldType.SELECT
      });
      selectKufKif.addSelectOption({
        value: '',
        text: '',
        isSelected: true
      });
      selectKufKif.addSelectOption({
        value: 'KIF',
        text: 'KIF'
      });
      selectKufKif.addSelectOption({
        value: 'KUF',
        text: 'KUF'
      });
      selectKufKif.updateLayoutType({
        layoutType: serverWidget.FieldLayoutType.OUTSIDEBELOW
      });
      selectKufKif.updateBreakType({
        breakType: serverWidget.FieldBreakType.STARTROW
      });

      // Subsidiary select field
      var subsidiaryField = form.addField({
        id: 'subsidiary',
        label: 'Subsidiary:',
        type: serverWidget.FieldType.SELECT
      });
      var subsidiaries = getSubsidiaries();
      for (var i in subsidiaries) {
        subsidiaryField.addSelectOption({
          value: subsidiaries[i].internalid,
          text: subsidiaries[i].internalid + '/' + subsidiaries[i].name
        });
      }

      // POPDV date input fields
      var popdvDateFromField = form.addField({
        id: 'popdvdatefrom',
        label: "Popdv datum od *:",
        type: serverWidget.FieldType.DATE
      }).updateDisplaySize({
        height: 60,
        width: 150
      });
      popdvDateFromField.updateLayoutType({
        layoutType: serverWidget.FieldLayoutType.OUTSIDEBELOW
      });
      popdvDateFromField.updateBreakType({
        breakType: serverWidget.FieldBreakType.STARTROW
      });
      var popdvDateToField = form.addField({
        id: 'popdvdateto',
        label: "Popdv datum do *:",
        type: serverWidget.FieldType.DATE
      }).updateDisplaySize({
        height: 60,
        width: 150
      });
      popdvDateToField.updateLayoutType({
        layoutType: serverWidget.FieldLayoutType.OUTSIDEBELOW
      });
      popdvDateToField.updateBreakType({
        breakType: serverWidget.FieldBreakType.STARTROW
      });

      // Inline HTML field
      var htmlField = form.addField({
        id: 'htmlfield',
        label: "Lista generisanih izvestaja",
        type: serverWidget.FieldType.INLINEHTML
      });



      // TODO MILAN Ovde se dodaju podaci za tabelu
      htmlField.defaultValue = createKifKufDataList();
      htmlField.updateLayoutType({
        layoutType: serverWidget.FieldLayoutType.OUTSIDEBELOW
      });
      htmlField.updateBreakType({
        breakType: serverWidget.FieldBreakType.STARTROW
      });




      // Buttons
      form.addButton({
        id: 'runmrscript',
        label: "Generisi podatke",
        functionName: 'runMrScript'
      });
      form.addButton({
        id: 'checkstatusbtn',
        label: "Provera statusa",
        functionName: 'checkTaskStatus'
      });
      form.addButton({
        id: 'refreshpage',
        label: "Osvezi stranicu",
        functionName: 'refreshPage'
      });
      form.addButton({
        id: 'resetlocalstorage',
        label: "Reset",
        functionName: 'resetLocalStorage'
      });

      return form;
    }

    // Suitelet entry point function
    function onRequest(params) {
      var form = createForm();
      params.response.writePage(form);
    }

    return {
      onRequest: onRequest,
    };

  });