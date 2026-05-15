/**
 * TriggerManager.gs
 * Installs and removes time-based ScriptApp triggers for the Scheduler.
 */

/**
 * Installs a time-based trigger to call runScheduler every minute.
 * Skips creation if a trigger for runScheduler already exists.
 * Requirements: 6.1, 6.2, 6.3
 */
function setupTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runScheduler') {
      return; // Trigger already exists — do not create a duplicate
    }
  }
  ScriptApp.newTrigger('runScheduler')
    .timeBased()
    .everyMinutes(1)
    .create();
}

/**
 * Removes all triggers created by setupTriggers (those whose handler is runScheduler).
 * Requirements: 6.4
 */
function removeTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runScheduler') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
