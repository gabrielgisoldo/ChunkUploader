var ChunkUploader = function(opts) {
    this.defaults = {
        file: null,
        url: null,
        timeout: 30000,
        method: 'POST',
        chunk_size: (1024 * 100),
        range_start: 0,
        attempts: 5,
        debug: false,
        send_as_form: false,
        file_name: 'teste',
        append_on_form: {},
        onCompleteUpload: function () {},
        onProgressUpload: function () {},
        onUploadError: function (err) {console.log(err);},
        onUploadFail: function (err) {console.log(err);},
        onTimeOut: function (e) {console.log(e);},
        onStartUpload: function () {}
    }

    /* copy user options or use default values */
    for (var i in this.defaults) {
        this[i] = (opts[i] !== undefined) ? opts[i] : this.defaults[i]
    }

    if ('mozSlice' in this.file) {
        this.slice_method = 'mozSlice';
    }
    else if ('webkitSlice' in this.file) {
        this.slice_method = 'webkitSlice';
    }
    else {
        this.slice_method = 'slice';
    }

    this.is_paused = false;
    this.range_end = this.chunk_size;
    this.file_size = this.file.size;
    this.remaining_attempts = this.attempts;

    this.upload_request = new XMLHttpRequest();
    this.upload_request.ontimeout = this._onTimeOut.bind(this);
    this.upload_request.onload = this._onChunkComplete.bind(this);
    this.upload_request.onerror = this._retry.bind(this);

    this.bytes = 0;

    if ('onLine' in navigator) {
        window.addEventListener('offline', this._onConnectionLost);
    }
    
}

ChunkUploader.prototype.get_file = function() {
    /*Return the value of file.*/

    return this.file;
};

ChunkUploader.prototype.get_url = function() {
    /*Return the value of url.*/

    return this.url;
};

ChunkUploader.prototype.get_method = function() {
    /*Return the value of method.*/

    return this.method;
};

ChunkUploader.prototype.get_chunk_size = function() {
    /*Return the value of chunk_size.*/

    return this.chunk_size;
};

ChunkUploader.prototype.get_range_start = function() {
    /*Return the value of range_start.*/

    return this.range_start;
};

ChunkUploader.prototype.get_range_end = function() {
    /*Return the value of range_end.*/

    return this.range_end;
};

ChunkUploader.prototype.get_onCompleteUpload = function() {
    /*Return the value of onCompleteUpload.*/

    return this.onCompleteUpload;
};

ChunkUploader.prototype.get_onProgressUpload = function() {
    /*Return the value of onProgressUpload.*/

    return this.onProgressUpload;
};

ChunkUploader.prototype.get_onUploadError = function() {
    /*Return the value of onUploadError.*/

    return this.onUploadError;
};

ChunkUploader.prototype.get_onStartUpload = function() {
    /*Return the value of onStartUpload.*/

    return this.onStartUpload;
};

ChunkUploader.prototype.onTimeOut = function() {
    /*Return the value of onTimeOut.*/

    return this.onTimeOut;
};

ChunkUploader.prototype.get_is_paused = function() {
    /*Return the value of is_paused*/

    return this.is_paused;
};

ChunkUploader.prototype.get_upload_request = function() {
    /*Return the value of upload_request*/

    return this.upload_request;
};

ChunkUploader.prototype._onConnectionLost = function() {
    /*Retry the upload if the connection is lost.*/
    this._retry({'status': 2, 'status_text': 'Lost internet connection.', 'attempts_remaining': this.remaining_attempts});
};

ChunkUploader.prototype._upload = function() {
    /*Do the actual upload of the file.*/

    var self = this, chunk;

    chunk = self.file[self.slice_method](self.range_start, self.range_end);

    setTimeout(function(){

        if (self.debug) {
            self.bytes += chunk.size;

            console.log(self.bytes);

            self._onChunkComplete();
        } else {

            self.upload_request.open(self.method, self.url, true);

            self.upload_request.timeout = self.timeout;

            if (!self.send_as_form) {

                self.upload_request.overrideMimeType('application/octet-stream');
         
                if (self.range_start !== 0) {
                    self.upload_request.setRequestHeader('Content-Range', 'bytes ' + self.range_start + '-' + self.range_end + '/' + self.file_size);
                }

                self.upload_request.send(chunk);
            } else {
                form_data = new FormData();
                form_data.append("file", chunk, self.file_name);
                for (var i in self.append_on_form) {
                    form_data.append(i, self.append_on_form[i]);
                }

                self.upload_request.send(form_data);
            }
        }

    }, 200)
};

ChunkUploader.prototype._onChunkComplete = function() {
    /*Calculate the size of the chunk and verify if the upload is complete.*/

    if (this.upload_request.status < 300) {

        this.remaining_attempts = this.attempts;

        info = {'total': this.file_size, 'loaded': this.range_end};

         if (this.onProgressUpload && typeof this.onProgressUpload === 'function'){
            //In case we have received a function on parameter, we execute everytime we upload a chunk so we can keep track of the upload's progress.
            this.onProgressUpload(info);
        }

        var self = this;

        setTimeout(function() {

            if (self.range_end === self.file_size) {
                self.file = null;
                self.file_size = null;
                self.onCompleteUpload();
                return;
            }

            self.range_start = self.range_end;

            self.range_end = self.range_start + self.chunk_size;

            if (self.range_end > self.file_size) {
                self.range_end = self.file_size;
            }

            if (!this.is_paused) {
                self._upload();
            }
        }, 20)

    } else {
        this._retry({'status': this.upload_request.status, 'status_text': this.upload_request.statusText, 'attempts_remaining': this.remaining_attempts});
    }
};

ChunkUploader.prototype._retry = function(err) {
    /*In case of error, we retry the upload from where we stopped.*/

    if (this.remaining_attempts > 0) {
        this.remaining_attempts -= 1
        if (this.onUploadError && typeof this.onUploadError === 'function'){
            //In case we have received a function on parameter, we execute and then we retry doing the upload.
            this.onUploadError(err);
        }

        setTimeout(this._upload(), 20);
    } else {
        this.upload_request.abort();
        this.onUploadFail({'status': 0, 'status_text': 'Exhausted upload attempts.', 'attempts_remaining': this.remaining_attempts});
    }
};

ChunkUploader.prototype._onTimeOut = function(e) {
    /*In case of timeout, we retry the upload from where we stopped.*/

    var self = this;

    if (self.onTimeOut && typeof self.onTimeOut === 'function'){
        self.onTimeOut(e);
    }

    setTimeout(function() {
        self._retry({'status': 1, 'status_text': 'Request timed out.', 'attempts_remaining': self.remaining_attempts});
    }, 20);
};

ChunkUploader.prototype.start = function() {
    /*Start the uplaod.*/

    if (this.onStartUpload && typeof this.onStartUpload === 'function'){
        //In case we have received a function on parameter, we execute and then start the upload.
        this.onStartUpload();
    }
    setTimeout(this._upload(), 20);
};

ChunkUploader.prototype.pause = function() {
    /*Pause the upload.*/

    this.is_paused = true;
};

ChunkUploader.prototype.resume = function() {
    /*Resume the upload.*/

    this.is_paused = false;
    this._upload();
};
