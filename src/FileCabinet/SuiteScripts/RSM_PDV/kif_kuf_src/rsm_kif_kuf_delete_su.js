/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(["N/file", 'N/record', 'N/redirect', 'N/log'],

  function (file, record, redirect, log) {

    function onRequest(context) {
      if (context.request.method === 'GET') {

        var recordId = context.request.parameters.internalid,
          fileId = context.request.parameters.fileid;

        record.delete({
          type: 'customrecord_kif_kuf_data',
          id: recordId
        });
        file.delete({
          id: fileId
        });

        redirect.toSuitelet({
          scriptId: 'customscript_kif_kuf_form_su',
          deploymentId: 'customdeploy_kif_kuf_form_su'
        });

      } else {
        context.response.write("404");
      }
    }

    return {
      onRequest: onRequest
    };
  });
