let selectedFile;
const initControls = function () {
  document.querySelector('#update').addEventListener('click', function (evt) {
    selectedFile = document.querySelector('#upload_file').files[0];
    let xhr = new XMLHttpRequest();
    xhr.open('POST', '/update', true);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.onreadystatechange = function () {
      if (this.readyState === XMLHttpRequest.DONE && this.status === 200) {
        alert('update complete!');
      }
    };
    xhr.send(selectedFile);
  });
};

(function () {
  initControls();
})();