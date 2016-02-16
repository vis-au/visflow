/**
 * @fileoverview Diagram related functions.
 */

/** @const */
visflow.diagram = {};

/** @const {string} */
visflow.diagram.LOAD_URL = './server/load.php';
/** @const {string} */
visflow.diagram.SAVE_URL = './server/save.php';

/**
 * Last used diagram name.
 * @type {string}
 */
visflow.diagram.lastFilename = 'myDiagram';

/**
 * Saves the current flow.
 */
visflow.diagram.save = function() {
  $.post('./server/load.php', {
    type: 'filelist'
  }).done(function(data) {
    var fileList = data.filelist;
    var fileNames = _.keySet(fileList.map(function(file) {
      return file.filename;
    }));

    visflow.dialog.create({
      template: './src/dialog/save-diagram.html',
      complete: function(dialog) {
        var input = dialog.find('input').val(visflow.diagram.lastFilename);
        var confirm = dialog.find('#confirm');

        input.on('keyup', function() {
          confirm.prop('disabled', $(this).val() == '');
        });
        confirm.click(function(event) {
          var fileName = input.val();
          if (fileName in fileNames) {
            // Another modal will be loaded immediately.
            // So we prevent modal close here.
            event.stopPropagation();

            visflow.diagram.uploadOverwrite_(fileName);
          } else {
            visflow.diagram.upload_(fileName);
          }
        });

        var table = dialog.find('table');
        visflow.diagram.listTable_(table, fileList);
        table.on('select.dt', function() {
          var fileName = table.find('tr.selected').children().first().text();
          input.val(fileName);
        });
      }
    });
  }).fail(function() {
    visflow.error('failed to get diagram list (connection error)');
  });
};


/**
 * Loads a saved flow diagram.
 */
visflow.diagram.load = function() {
  $.post(visflow.diagram.LOAD_URL, {
    type: 'filelist'
  }).done(function(data) {
    var data_ = /** @type {{
      filelist: !Array<{filename: string, mtime: number}>
    }} */(data);
    var fileList = data_.filelist;

    visflow.dialog.create({
      template: './src/dialog/load-diagram.html',
      complete: function(dialog) {
        var fileName = visflow.diagram.lastFilename;

        var confirm = dialog.find('#confirm').prop('disabled', true)
          .click(function() {
            visflow.diagram.download(fileName);
          });

        var table = dialog.find('table');
        visflow.diagram.listTable_(table, fileList);
        table.on('select.dt', function() {
          fileName = table.find('tr.selected').children().first().text();
          confirm.prop('disabled', false);
        });
      }
    });
  }).fail(function() {
    visflow.error('failed to get diagram list (connection error)');
  });
};

/**
 * Creates a new flow diagram.
 */
visflow.diagram.new = function() {
  visflow.dialog.create({
    template: './src/dialog/new-diagram.html',
    complete: function(dialog) {
      dialog.find('#confirm').click(function() {
        visflow.diagram.lastFilename = 'myDiagram';
        visflow.diagram.updateURL('myDiagram');
        visflow.flow.clearFlow();
      });
    }
  });
};

/**
 * Downloads a flow diagram file from the server.
 * @param {string} filename
 */
visflow.diagram.download = function(filename) {
  visflow.diagram.lastFilename = filename;
  $.post(visflow.diagram.LOAD_URL, {
    type: 'download',
    filename: filename
  }).done(function(data) {
      if (data.status != 'success') {
        visflow.error('failed to download diagram', data.msg);
        return;
      }
      visflow.flow.deserializeFlow(data.diagram);
      visflow.diagram.updateURL(filename);
    })
    .fail(function() {
      visflow.error('failed to download diagram (connection error)');
    });
};

/**
 * Uploads the current flow to server and saves it as 'filename'.
 * @param {string} filename
 * @private
 */
visflow.diagram.upload_ = function(filename) {
  visflow.diagram.lastFilename = filename;
  $.post(visflow.diagram.SAVE_URL, {
    filename: filename,
    flow: JSON.stringify(visflow.flow.serializeFlow())
  }).done(function(data) {
      if (data.status != 'success') {
        visflow.error('failed to save diagram', data.msg);
        return;
      }
      visflow.success('diagram upload successful:', data.filename);
      visflow.diagram.updateURL(filename);
    })
    .fail(function() {
      visflow.error('failed to save diagram (connection error)');
    });
};

/**
 * Updates the window URL without refreshing the page to reflect the new diagram
 * name.
 * @param {string} name
 */
visflow.diagram.updateURL = function(name) {
  if (history.pushState) {
    var url = window.location.protocol + '//' + window.location.host +
      window.location.pathname + '?diagram=' + name;
    window.history.pushState({path: url}, '', url);
  }
};

/**
 * Asks for confirmation about overwriting diagram file.
 * @param {string} fileName
 * @private
 */
visflow.diagram.uploadOverwrite_ = function(fileName) {
  visflow.dialog.create({
    template: './src/dialog/overwrite-diagram.html',
    complete: function(dialog) {
      dialog.find('label').text(fileName);
      dialog.find('#confirm').click(function() {
        visflow.diagram.upload_(fileName);
      });
    }
  });
};


/**
 * Shows a table with list of diagrams saved on server.
 * @param {!jQuery} table
 * @param {!Array<{filename: string, mtime: number}>} fileList
 * @private
 */
visflow.diagram.listTable_ = function(table, fileList) {
  table.DataTable({
    data: fileList,
    select: 'single',
    pagingType: 'full',
    pageLength: 5,
    lengthMenu: [5, 10, 20],
    order: [
      [1, 'desc']
    ],
    columns: [
      {title: 'File Name', data: 'filename'},
      {title: 'Last Modified', data: 'mtime'}
    ],
    columnDefs: [
      {
        render: function(lastModified) {
          return (new Date(lastModified)).toLocaleString();
        },
        targets: 1
      }
    ]
  });
};
