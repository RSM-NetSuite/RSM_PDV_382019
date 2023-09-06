/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */
define(['N/task', 'N/log'], function (task, log) {

  function post(requestBody) {

    if (requestBody.action === 'runscript') {
      var script = (requestBody.script === 'kif') ?
        { scriptId: 'customscript_kif_mr', deploymentId: 'customdeploy_kif_mr' } :
        { scriptId: 'customscript_kuf_mr', deploymentId: 'customdeploy_kuf_mr' };

      var dynamicParams = {
        custscript_kif_subsidiary: requestBody.subsidiary,
        custscript_popdv_date_from: requestBody.popdvdates.from,
        custscript_popdv_date_to: requestBody.popdvdates.to,
      };
      if (requestBody.script === 'kuf') {
        dynamicParams = {
          custscript_kuf_subsidiary: requestBody.subsidiary,
          custscript_kuf_popdv_date_from: requestBody.popdvdates.from,
          custscript_kuf_popdv_date_to: requestBody.popdvdates.to
        };
      }

      var mrTask = task.create({
        taskType: task.TaskType.MAP_REDUCE
      });
      mrTask.scriptId = script.scriptId;
      mrTask.deploymentId = script.deploymentId;
      mrTask.params = dynamicParams;
      var mrTaskId = mrTask.submit();

      // Response object
      return {
        "mrtaskid": mrTaskId
      };

    } else if (requestBody.action === 'checkstatus') {
      var summary = task.checkStatus({
        taskId: requestBody.taskid
      });

      // Response object
      return {
        "status": summary.status,
        "stage": summary.stage
      }
    }
  }

  return {
    post: post
  };

});
