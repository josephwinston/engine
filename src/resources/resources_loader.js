pc.extend(pc.resources, function () {
    /**
    * @name pc.resources.ResourceLoader
    * @constructor Create a new instance of a ResourceLoader
    * @class Used to make requests for remote resources.
    * The ResourceLoader is used to request a resource using an identifier (often the url of a remote file).
    * Registered {@link pc.resources.ResourceHandler} perform the specific loading and opening functionality and will return
    * a new instance of a resource. The ResourceLoader contains a built in cache, that uses file hashes to ensure that
    * resources are not fetched multiple times. Hashes must be registered against an identifier prior to making requests.
    * @example
    * var loader = new pc.resources.ResourceLoader();
    * loader.registerHandler(pc.resources.ImageRequest, new pc.resources.ImageResourceHandler());
    * var promise = loader.request(new pc.resources.ImageRequest("http://example.com/image.png"));
    * promise.then(function (resources) {
    *   var img = resources[0];
    * });
    */
    var ResourceLoader = function () {
        if (window.RSVP === undefined) {
            logERROR('Missing RSVP library');
        }

        this._types = {}; // Registered resource types
        this._handlers = {}; // Registered resource handlers indexed by type
        this._requests = {}; // Currently active requests
        this._cache = {}; // Loaded resources indexed by hash
        this._hashes = {}; // Lookup from identifier to hash
        this._canonicals = {}; // Lookup from hash to canonical identifier

        // Counters for progress
        this._requested = 0;
        this._loaded = 0;

        this._sequence = 0; // counter for tracking requests uniquely

        this.cache = true; // set this to false to perform cache busting on resources

        pc.events.attach(this);
    };

    ResourceLoader.prototype = {
        /**
        * @function
        * @name pc.resources.ResourceLoader#createFileRequest
        * @description Return a new {@link pc.resources.ResourceRequest} from the types that have been registered.
        * @param {String} identifier The identifier (usually URL) used to uniquely identify the asset to load
        * @param {String} type The asset type to create a ResourceRequest for ()
        * @returns {pc.resources.ResourceRequest} A new ResourceRequest instance
        * @example
        * var request = loader.createFileRequest('assets/12/12341234-1234-1234-123412341234/image.jpg', 'image'); // pc.resources.ImageRequest
        */
        createFileRequest: function (identifier, type) {
            return new this._types[type](identifier);
        },

        /**
         * @function
         * @name pc.resources.ResourceLoader#registerHandler
         * @description Register a handler for a new type of resource. To register a handler you need to provided an instance of a ResourceHandler,
         * and the ResourceRequest type to be associated with the handler.
         * @param {pc.resources.ResourceRequest} RequestType The type of request to associate with this handler
         * @param {pc.resources.ResourceHandler} handler A ResourceHandler instance.
         */
        registerHandler: function (RequestType, handler) {
            var request = new RequestType();
            if (request.type === "") {
                throw Error("ResourceRequests must have a type");
            }
            this._types[request.type] = RequestType;
            this._handlers[request.type] = handler;
            handler.setLoader(this);
        },

        /**
        * @function
        * @name pc.resources.ResourceLoader#request
        * @description Make a request for one or more resources from a remote location. A call to request() will try to retrieve all the resources requested,
        * using the ResourceHandlers for the specific type of request. Resources are cached once they have been requested, and subsequent requests will return the
        * the cached value.
        * The request() call returns a Promise object which is used to access the resources once they have all been loaded.
        * @param {pc.resources.ResourceRequest|pc.resources.ResourceRequest[]} requests A single or list of {@link pc.resources.ResourceRequest}s which will be requested in this batch.
        * @returns {pc.promise.Promise} A Promise object which is used to retrieve the resources once they have completed
        * @example
        * var requests = [
        *   new pc.resources.ImageRequest("http://example.com/image_one.png"),
        *   new pc.resources.ImageRequest("http://example.com/image_two.png")
        * ];
        * var promise = loader.request(requests);
        * promise.then(function(resources) {
        *   var img1 = resources[0];
        *   var img2 = resources[1];
        * });
        */
        request: function (requests, options) {
            options = options || {};

            var self = this;
            var parent = options.parent;

            options.cache = self.cache;

            var promise = new pc.promise.Promise(function (resolve, reject) {
                var i, n;
                var p;

                // Convert single request to list
                if (requests.length === undefined) {
                    requests = [requests];
                }

                var requested = [];
                var promises = [];

                for (i = 0, n = requests.length; i < n; i++) {
                    // Use an existing request if there is a valid one in progress
                    var request = self._findExistingRequest(requests[i]);
                    // If we are using an existing request, we need to copy over result and data fields.
                    // TODO: What happens if the existing request has a data field!
                    if (request !== requests[i]) {
                        request.data = requests[i].data;
                    }

                    self._makeCanonical(request);

                    promises.push(self._request(request, options));
                    requested.push(request);

                    // If there is a parent request, add all child requests on parent
                    if (parent) {
                        parent.children.push(request);
                    }
                }

                // Check that all child promises of the requests have been completed
                var check = function (resources, requests, promises) {
                    var i, n;
                    var childPromises = [];
                    var childRequests = [];
                    requests.forEach(function (r) {
                        r.children.forEach(function (c) {
                            childRequests.push(c);
                            childPromises.push.apply(childPromises, c.promises);
                        })
                    });

                    if (childPromises.length) {
                        pc.promise.all(childPromises).then(function(childResources) {
                            check(resources, childRequests, childPromises);
                        }, function (error) {
                            reject(error);
                        });
                    } else {
                        self.fire("complete", resources)
                        resolve(resources)
                    }
                }

                pc.promise.all(promises).then(function (resources) {
                    check(resources, requested, promises);
                }, function (error) {
                    reject(error);
                });

            });

            return promise;
        },

        /**
        * @private
        * @function
        * @name pc.resources.ResourceLoader#open
        * @description Perform just the open() part of the resource loading process. Useful if you already have the data from somewhere.
        * @param {pc.resources.ResourceRequest} RequestType The type of request to open
        * @param {Object} data The data to use for the new resource
        * @param {Object} options Optional arguments
        */
        open: function (RequestType, data, options) {
           var request = new RequestType();
           return this._handlers[request.type].open(data, request, options);
        },

        /**
        * @function
        * @name pc.resources.ResourceLoader#registerHash
        * @description Register a connection between a file hash and an identifier. If the same file is located via several identifiers, the hash ensures that only a single request is made.
        * @param {String} hash The file hash
        * @param {String} identifier The resource identifier
        */
        registerHash: function (hash, identifier) {
            if (!this._hashes[identifier]) {
                this._hashes[identifier] = hash;
            }

            if (!this._canonicals[hash]) {
                // First hash registered to a url gets to be canonical
                this._canonicals[hash] = identifier;
            }
        },

        /**
        * @function
        * @name pc.resources.ResourceLoader#unregisterHash
        * @description Unregister existing connection between a file hash and an identifier.
        * @param {String} identifier The resource identifier
        */
        unregisterHash: function (identifier) {
            var hash = this.getHash(identifier);
            if (hash) {
                delete this._canonicals[hash];
                delete this._hashes[identifier];
            }
        },

        /**
        * @function
        * @name pc.resources.ResourceLoader#getHash
        * @description Return the hash registered against the identifier
        * @param {String} identifier The identifier of a resource
        * @returns {String|undefined} The hash if the identifier is registered or undefined
        */
        getHash: function(identifier) {
            return this._hashes[identifier];
        },

        /**
        * @function
        * @name pc.resources.ResourceLoader#addToCache
        * @description Add a resource into the cache so that future requests will not make new requests.
        * @param {String} identifier The identifier for the resource
        * @param {Object} resource The resource to be cached
        */
        addToCache: function (identifier, resource) {
            var hash = this.getHash(identifier);
            if (hash) {
                this._cache[hash] = resource;
            } else {
                //logWARNING(pc.string.format("Could not add {0} to cache, no hash registered", identifier));
            }
        },

        /**
        * @function
        * @name pc.resources.ResourceLoader#getFromCache
        * @description Try and get a resource from the cache.
        * @param {String} identifier The identifier of the resource
        * @returns {Object|null} The resource if it exists in the cache, otherwise returns null
        */
        getFromCache: function (identifier) {
            var hash = this.getHash(identifier);
            if (hash) {
                return this._cache[hash];
            } else {
                return null;
            }
        },

        /**
        * @function
        * @name pc.resources.ResourceLoader#removeFromCache
        * @description Remove a resource from the cache
        * @param {String} identifier The identifier for the resource
        */
        removeFromCache: function (identifier) {
            var hash = this.getHash(identifier);
            if (hash) {
                delete this._cache[hash];
            } else {
                return null;
            }
        },

        /**
        * @function
        * @name pc.resources.ResourceLoader#resetProgress
        * @description Call this to reset the progress counter to 0
        */
        resetProgress: function () {
            this._requested = 0;
            this._loaded = 0;
        },

        // Make a request for a single resource and open it
        _request: function (request, _options) {
            var self = this;
            var promise = null;
            var options = {}; // Make a copy of the options per request
            for (key in _options) {
                options[key] = _options[key];
            }

            if (request.id === null) {
                request.id = this._sequence++;
            }
            this.fire("request", request);

            if (request.promises.length) {
                // If the request has already been made, then wait for the result to come in
                request.promises.push(new pc.promise.Promise(function (resolve, reject) {
                    request.promises[0].then(function (resource) {
                        var resource = self._postOpen(resource, request);
                        resolve(resource);
                    });
                }));
            } else {

                // Check cache, load and open the requested data
                request.promises[0] = new pc.promise.Promise(function (resolve, reject) {
                    var handler = self._handlers[request.type];
                    if (!handler) {
                        var msg = "Missing handler for type: " + request.type;
                        self.fire("error", request, msg);
                        reject(msg);
                        return;
                    }

                    var resource = self.getFromCache(request.canonical);

                    // If there is a cached resource.
                    // If the request specifies a type, we check the cached type matches
                    if (resource && (request.Type === undefined || (resource instanceof request.Type))) {
                        // In cache, just resolve
                        resource = self._postOpen(resource, request);
                        resolve(resource);
                    } else {
                        // Not in cache, load the resource
                        var promise = handler.load(request, options);
                        promise.then(function (data) {
                            try {
                                var resource = self._open(data, request, options);
                                if (resource) {
                                    resource = self._postOpen(resource, request);
                                }
                                resolve(resource);
                            } catch (e) {
                                reject(e);
                            }
                        }, function (error) {
                            self.fire("error", request, error);
                            reject(error);
                        });
                    }
                });
            }

            self._requests[request.canonical] = request;
            this._requested++;

            return request.promises[request.promises.length - 1];
        },

        // Convert loaded data into the resource using the handler's open() and clone() methods
        _open: function (data, request, options) {
            return this._handlers[request.type].open(data, request, options);
        },

        // After loading and opening clean up and fire events
        // Note, this method is called in three places,
        // - with a newly opened resource
        // - with a resource retrieved from the cache
        // - with a resource that was requested twice concurrently, this is called again for the second request.
        _postOpen: function (resource, request) {
            this.addToCache(request.canonical, resource);

            resource = this._handlers[request.type].clone(resource, request);

            delete this._requests[request.canonical];
            this._loaded++
            this.fire("progress", this._loaded / this._requested);
            this.fire("load", request, resource);

            return resource;
        },

        /**
        * @private
        * @name pc.resources.ResourceLoader#_makeCanonical
        * @description Set the canonical property on the request object. The canonical identifier is the identifier used
        * to make all requests. Resources with the same hash but different URLs will have the same canonical so that requests are not
        * duplicated
        *
        */
        _makeCanonical: function (request) {
            var hash = this.getHash(request.identifier);
            if (hash && this._canonicals[hash]) {
                request.canonical = this._canonicals[hash];
            } else {
                request.canonical = request.identifier;
            }
        },

        /**
        * @private
        * @name pc.resources.ResourceLoader#_findExistingRequest
        * @description Using the canonical identifier, find and return an existing request for this resource
        * This doesn't return a request if a result object was provided for either request
        */
        _findExistingRequest: function (request) {
            var existing = this._requests[request.canonical];
            if (existing) {
                // Don't return existing request if requests are for different resource types or if either has a result object.
                if ((existing.type !== request.type) || existing.result || request.result) {
                    return request;
                } else {
                    return existing;
                }
            } else {
                return request;
            }
        },
    };


    /**
     * @name pc.resources.ResourceRequest
     * @class A request for a single resource, located by a unique identifier.
     * @constructor Create a new request for a resoiurce
     * @param {String} identifier Used by the request handler to locate and access the resource. Usually this will be the URL or GUID of the resource.
     * @param {Object} [data] Additional data that the resource handler might need when creating the resource after loading
     * @param {Object} [result] If a result object is supplied, this will be used instead of creating a new instance of the resource (only for supporting resource types)
     */
    var ResourceRequest = function ResourceRequest(identifier, data, result) {
        this.id = null;               // Sequence ID, given to the request when it is made
        this.canonical = identifier;  // The canonical identifier using the file hash (if available) to match identical resources
        this.alternatives = [];       // Alternative identifiers to the canonical
        this.promises = [];           // List of promises that will be honoured when the request is complete. The first promise in the list is the primary one.
        this.children = [];           // Any child requests which were made while this request was being processed
        this.data = data;             // Additional data that the resource handler might need once it has loaded
        this.result = result;         // The result object can be supplied and used by a handler, instead of creating a new resource
        this.identifier = identifier  // The identifier for this resource

    };

    /**
     * @name pc.resources.ResourceHandler
     * @class Abstract base class for ResourceHandler. The resource handler performs the request to fetch the resource from a remote location,
     * and then it converts the response into the runtime resource object type. A resource handler must implement three methods:
     *
     * load() which fetches the resource data from a remote location (a file, a remote server, etc)
     * open() which takes the response from load() and creates a new instance of a Resource
     * clone() which takes the opened resource and _may_ return a new copy of it, if necessary. Otherwise returns the original.
     */
    var ResourceHandler = function () {
    };

    ResourceHandler.prototype = {
        setLoader: function (loader) {
            this._loader = loader;
        },

        /**
         * @function
         * @name pc.resources.ResourceHandler#load
         * @description Fetch the resource from a remote location and then call the success callback with the response
         * If an error occurs the request is stopped and the error callback is called with details of the error.
         * If supported the progress callback is called during the download to report percentage complete progress.
         * @param {string} identifier A unique identifier for the resource, possibly the URL or GUID of the resource
         * @param {Object} [options]
         * @param {Number} [options.priority] The priority of the request for this resource
         * @returns {Promise} A promise of the resource data
          */
        load: function (request, options) {
            throw Error("Not implemented");
        },

        /**
        * @function
        * @name pc.resources.ResourceHandler#open
        * @description Take the data downloaded from the request and turn it into a resource object for use at runtime.
        * For example, and ImageResourceHandler.open() will return an Image object and an EntityResourceHandler.open() will return an Entity.
        * @param data The data used to instanciate the resource
        * @param [options]
        * @param {Number} [options.priority] The priority of the request for this resource
        */
        open: function (data, options) {
            throw Error("Not implemented");
        },

        /**
        * @function
        * @name pc.resources.ResourceHandler#clone
        * @description If necessary return a clone of the resource. This is called after open(), if it is not possible to share a single instance
        * of a resource from the cache, then clone should return a new copy, otherwise the default is to return the original.
        * @param {Object} resource The resource that has just been requested
        * @returns {Object} Either the resource that was passed in, or a new clone of that resource
        */
        clone: function (resource) {
            return resource;
        }
    };

    return {
        ResourceLoader: ResourceLoader,
        ResourceHandler: ResourceHandler,
        ResourceRequest: ResourceRequest
    };
}());
