pc.extend(pc.fw, function () {

    var time;

    /**
     * @name pc.fw.Application
     * @class Default application which performs general setup code and initiates the main game loop
     * @constructor Create a new Application
     * @param {DOMElement} canvas The canvas element
     * @param {Object} options
     * @param {pc.input.Controller} [options.controller] Generic input controller, available from the ApplicationContext as controller.
     * @param {pc.input.Keyboard} [options.keyboard] Keyboard handler for input, available from the ApplicationContext as keyboard.
     * @param {pc.input.Mouse} [options.mouse] Mouse handler for input, available from the ApplicationContext as mouse.
     * @param {Object} [options.libraries] List of URLs to javascript libraries which should be loaded before the application starts or any packs are loaded
     * @param {Boolean} [options.displayLoader] Display resource loader information during the loading progress. Debug only
     * @param {pc.common.DepotApi} [options.depot] API interface to the current depot
     * @param {String} [options.scriptPrefix] Prefix to apply to script urls before loading
     *
     * @example
     * // Create application
     * var app = new pc.fw.Application(canvas, options);
     * // Start game loop
     * app.start()
     */
    var Application = function (canvas, options) {
        options = options || {};

        this._inTools = false;

        // Add event support
        pc.events.attach(this);

        this.canvas = canvas;
        this.fillMode = pc.fw.FillMode.KEEP_ASPECT;
        this.resolutionMode = pc.fw.ResolutionMode.FIXED;
        this.librariesLoaded = false;

        this._link = new pc.fw.LiveLink("application");
        this._link.addDestinationWindow(window);
        this._link.listen(this._handleMessage.bind(this));

        // Open the log
        pc.log.open();

        // Create the graphics device
        this.graphicsDevice = new pc.gfx.Device(canvas);

        // Enable validation of each WebGL command
        this.graphicsDevice.enableValidation(false);

        var registry = new pc.fw.ComponentSystemRegistry();

        this.audioManager = new pc.audio.AudioManager();

        // Create resource loader
        var loader = new pc.resources.ResourceLoader();
        if( options.cache === false )
            loader.cache = false;

        // Display shows debug loading information. Only really fit for debug display at the moment.
        if (options.displayLoader) {
            var loaderdisplay = new pc.resources.ResourceLoaderDisplay(document.body, loader);
        }

        // The ApplicationContext is passed to new Components and user scripts
        this.context = new pc.fw.ApplicationContext(loader, new pc.scene.Scene(), this.graphicsDevice, registry, options);

        if (options.content) {
            this.content = options.content;
            // Add the assets from all TOCs to the
            Object.keys(this.content.toc).forEach(function (key) {
                this.context.assets.addGroup(key, this.content.toc[key]);
            }.bind(this));
        }

        // Enable new texture bank feature to cache textures
        var textureCache = new pc.resources.TextureCache(loader);

        loader.registerHandler(pc.resources.JsonRequest, new pc.resources.JsonResourceHandler());
        loader.registerHandler(pc.resources.TextRequest, new pc.resources.TextResourceHandler());
        loader.registerHandler(pc.resources.ImageRequest, new pc.resources.ImageResourceHandler());
        loader.registerHandler(pc.resources.MaterialRequest, new pc.resources.MaterialResourceHandler( this.graphicsDevice, this.context.assets));
        loader.registerHandler(pc.resources.TextureRequest, new pc.resources.TextureResourceHandler(this.graphicsDevice));
        loader.registerHandler(pc.resources.ModelRequest, new pc.resources.ModelResourceHandler(this.graphicsDevice, this.context.assets));
        loader.registerHandler(pc.resources.AnimationRequest, new pc.resources.AnimationResourceHandler());
        loader.registerHandler(pc.resources.PackRequest, new pc.resources.PackResourceHandler(registry, options.depot));
        loader.registerHandler(pc.resources.AudioRequest, new pc.resources.AudioResourceHandler(this.audioManager));

        this.renderer = new pc.scene.ForwardRenderer(this.graphicsDevice);

        // Register the ScriptResourceHandler late as we need the context
        loader.registerHandler(pc.resources.ScriptRequest, new pc.resources.ScriptResourceHandler(this.context, options.scriptPrefix));

        var rigidbodysys = new pc.fw.RigidBodyComponentSystem(this.context);
        var collisionsys = new pc.fw.CollisionComponentSystem(this.context);
        var ballsocketjointsys = new pc.fw.BallSocketJointComponentSystem(this.context);

        var animationsys = new pc.fw.AnimationComponentSystem(this.context);
        var modelsys = new pc.fw.ModelComponentSystem(this.context);
        var camerasys = new pc.fw.CameraComponentSystem(this.context);
        var cubemapsys = new pc.fw.CubeMapComponentSystem(this.context);
        var staticcubemapsys = new pc.fw.StaticCubeMapComponentSystem(this.context);
        var lightsys = new pc.fw.LightComponentSystem(this.context);
        var packsys = new pc.fw.PackComponentSystem(this.context);
        var skyboxsys = new pc.fw.SkyboxComponentSystem(this.context);
        var scriptsys = new pc.fw.ScriptComponentSystem(this.context);
        var picksys = new pc.fw.PickComponentSystem(this.context);
        var audiosourcesys = new pc.fw.AudioSourceComponentSystem(this.context, this.audioManager);
        var audiolistenersys = new pc.fw.AudioListenerComponentSystem(this.context, this.audioManager);

        var designersys = new pc.fw.DesignerComponentSystem(this.context);

        // Load libraries
        this.on('librariesloaded', this.onLibrariesLoaded, this);
        if (options.libraries && options.libraries.length) {
            var requests = options.libraries.map(function (url) {
                return new pc.resources.ScriptRequest(url);
            });
            loader.request(requests).then( function (resources) {
                this.fire('librariesloaded', this);
                this.librariesLoaded = true;
            }.bind(this));
        } else {
            this.fire('librariesloaded', this);
            this.librariesLoaded = true;
        }

        // Depending on browser add the correct visibiltychange event and store the name of the hidden attribute
        // in this._hiddenAttr.
        if (typeof document.hidden !== 'undefined') {
            this._hiddenAttr = 'hidden';
            document.addEventListener('visibilitychange', this.onVisibilityChange.bind(this), false);
        } else if (typeof document.mozHidden !== 'undefined') {
            this._hiddenAttr = 'mozHidden';
            document.addEventListener('mozvisibilitychange', this.onVisibilityChange.bind(this), false);
        } else if (typeof document.msHidden !== 'undefined') {
            this._hiddenAttr = 'msHidden';
            document.addEventListener('msvisibilitychange', this.onVisibilityChange.bind(this), false);
        } else if (typeof document.webkitHidden !== 'undefined') {
            this._hiddenAttr = 'webkitHidden';
            document.addEventListener('webkitvisibilitychange', this.onVisibilityChange.bind(this), false);
        }

        // Store application instance
        Application._applications[this.canvas.id] = this;
    };

    Application._applications = {};
    Application.getApplication = function (id) {
        return Application._applications[id];
    };

    Application.prototype = {
        /**
        * Load a pack and asset set from a table of contents config
        * @param {String} name The name of the Table of Contents block to load
        */
        loadFromToc: function (name, success, error, progress) {
            if (!this.content) {
                error('No content');
            }

            var toc = this.content.toc[name];

            success = success || function () {};
            error = error || function () {};
            progress = progress || function () {};

            var requests = [];

            var guid = toc.packs[0];

            var onLoaded = function (resources) {
                // load pack
                this.context.loader.request(new pc.resources.PackRequest(guid)).then(function (resources) {
                    var pack = resources[0];
                    this.context.root.addChild(pack.hierarchy);
                    pc.fw.ComponentSystem.initialize(pack.hierarchy);
                    pc.fw.ComponentSystem.postInitialize(pack.hierarchy);

                    // Initialise pack settings
                    if (this.context.systems.rigidbody && typeof(Ammo) !== 'undefined') {
                        var gravity = pack.settings.physics.gravity;
                        this.context.systems.rigidbody.setGravity(gravity[0], gravity[1], gravity[2]);
                    }

                    var ambientLight = pack.settings.render.global_ambient;
                    this.context.scene.ambientLight = new pc.Color(ambientLight[0], ambientLight[1], ambientLight[2]);

                    this.context.scene.fog = pack.settings.render.fog;
                    var fogColor = pack.settings.render.fog_color;
                    this.context.scene.fogColor = new pc.Color(fogColor[0], fogColor[1], fogColor[2]);
                    this.context.scene.fogStart = pack.settings.render.fog_start;
                    this.context.scene.fogEnd = pack.settings.render.fog_end;
                    this.context.scene.fogDensity = pack.settings.render.fog_density;
                    this.context.scene.shadowDistance = pack.settings.render.shadow_distance;

                    success(pack);
                    this.context.loader.off('progress', progress);
                }.bind(this), function (msg) {
                    error(msg);
                }).then(null, function (error) {
                    // Re-throw any exceptions from the script's initialize method to stop them being swallowed by the Promises lib
                    setTimeout(function () {
                        throw error;
                    }, 0);
                });
            }.bind(this);

            var load = function () {
                // Get a list of asset for the first Pack
                var assets = this.context.assets.list(guid);

                // start recording loading progress from here
                this.context.loader.on('progress', progress);

                if (assets.length) {
                    this.context.assets.load(assets).then(function (resources) {
                        onLoaded(resources);
                    });
                } else {
                    // No assets to load
                    setTimeout(function () {
                        onLoaded([]);
                    }, 0);
                }
            }.bind(this);

            if (!this.librariesLoaded) {
                this.on('librariesloaded', function () {
                    load();
                });
            } else {
                load();
            }
        },

        /**
         * @function
         * @name pc.fw.Application#start
         * @description Start the Application updating
         */
        start: function () {
            if (!this.librariesLoaded) {
                this.on('librariesloaded', function () {
                    this.tick();
                }, this);
            } else {
                this.tick();
            }
        },

        /**
         * @function
         * @name pc.fw.Application#update
         * @description Application specific update method. Override this if you have a custom Application
         * @param {Number} dt The time delta since the last frame.
         */
        update: function (dt) {
            var context = this.context;

            // Perform ComponentSystem update
            pc.fw.ComponentSystem.fixedUpdate(1.0 / 60.0, context, this._inTools);
            pc.fw.ComponentSystem.update(dt, context, this._inTools);
            pc.fw.ComponentSystem.postUpdate(dt, context, this._inTools);

            // fire update event
            this.fire("update", dt);

            if (context.controller) {
                context.controller.update(dt);
            }
            if (context.mouse) {
                context.mouse.update(dt);
            }
            if (context.keyboard) {
                context.keyboard.update(dt);
            }
            if (context.gamepads) {
                context.gamepads.update(dt);
            }
        },

        /**
         * @function
         * @name pc.fw.Application#render
         * @description Application specific render method. Override this if you have a custom Application
         */
        render: function () {
            var context = this.context;
            var cameras = context.systems.camera.cameras;
            var camera = null;
            var renderer = this.renderer;

            context.root.syncHierarchy();

            // render the scene from each camera
            for (var i=0,len=cameras.length; i<len; i++) {
                camera = cameras[i];
                camera.frameBegin();
                renderer.render(context.scene, camera.camera);
                camera.frameEnd();
            }
        },

        /**
         * @function
         * @name pc.fw.Application#tick
         * @description Application specific tick method that calls update and render and queues
         * the next tick. Override this if you have a custom Application.
         */
        tick: function () {
            // Submit a request to queue up a new animation frame immediately
            requestAnimationFrame(this.tick.bind(this), this.canvas);

            var now = (window.performance && window.performance.now) ? performance.now() : Date.now();
            var dt = (now - (time || now)) / 1000.0;

            time = now;

            dt = pc.math.clamp(dt, 0, 0.1); // Maximum delta is 0.1s or 10 fps.

            this.update(dt);
            this.render();
        },

        /**
        * @function
        * @name pc.fw.Application#setCanvasFillMode
        * @description Change the way the canvas fills the window and resizes when the window changes
        * In KEEP_ASPECT mode, the canvas will grow to fill the window as best it can while maintaining the aspect ratio
        * In FILL_WINDOW mode, the canvas will simply fill the window, changing aspect ratio
        * In NONE mode, the canvas will always match the size provided
        * @param {pc.fw.FillMode} mode The mode to use when setting the size of the canvas
        * @param {Number} [width] The width of the canvas, only used in NONE mode
        * @param {Number} [height] The height of the canvase, only used in NONE mode
        */
        setCanvasFillMode: function (mode, width, height) {
            this.fillMode = mode;
            this.resizeCanvas(width, height);
        },

        /**
        * @function
        * @name pc.fw.Application#setCanvasResolution
        * @description Change the resolution of the canvas, and set the way it behaves when the window is resized
        * In AUTO mode, the resolution is change to match the size of the canvas when the canvas resizes
        * In FIXED mode, the resolution remains until another call to setCanvasResolution()
        * @param {pc.fw.ResolutionMode} mode The mode to use when setting the resolution
        * @param {Number} [width] The horizontal resolution, optional in AUTO mode, if not provided canvas clientWidth is used
        * @param {Number} [height] The vertical resolution, optional in AUTO mode, if not provided canvas clientHeight is used
        */
        setCanvasResolution: function (mode, width, height) {
            this.resolutionMode = mode;

            // In AUTO mode the resolution is the same as the canvas size, unless specified
            if (mode === pc.fw.ResolutionMode.AUTO && (width === undefined)) {
                width = this.canvas.clientWidth;
                height = this.canvas.clientHeight;
            }

            this.graphicsDevice.resizeCanvas(width, height);
        },

        /**
        * @function
        * @name pc.fw.Application#isFullscreen
        * @description Returns true if the application is currently running fullscreen
        * @returns {Boolean} True if the application is running fullscreen
        */
        isFullscreen: function () {
            return !!document.fullscreenElement;
        },

        /**
        * @function
        * @name pc.fw.Application#enableFullscreen
        * @description Request that the browser enters fullscreen mode. This is not available on all browsers.
        * Note: Switching to fullscreen can only be initiated by a user action, e.g. in the event hander for a mouse or keyboard input
        * @param {DOMElement} [element] The element to display in fullscreen, if element is not provided the application canvas is used
        * @param {Function} [success] Function called if the request for fullscreen was successful
        * @param {Function} [error] Function called if the request for fullscreen was unsuccessful
        * @example
        * var canvas = document.getElementById('application-canvas');
        * var application = pc.fw.Application.getApplication(canvas.id);
        * var button = document.getElementById('my-button');
        * button.addEventListener('click', function () {
        *     application.enableFullscreen(canvas, function () {
        *         console.log('fullscreen');
        *     }, function () {
        *         console.log('not fullscreen');
        *     });
        * }, false);
        */
        enableFullscreen: function (element, success, error) {
            element = element || this.canvas;

            // success callback
            var s = function () {
                success();
                document.removeEventListener('fullscreenchange', s);
            };

            // error callback
            var e = function () {
                error();
                document.removeEventListener('fullscreenerror', e);
            };

            if (success) {
                document.addEventListener('fullscreenchange', s, false);
            }

            if (error) {
                document.addEventListener('fullscreenerror', e, false);
            }
            element.requestFullscreen();
        },

        /**
        * @function
        * @name pc.fw.Application#disableFullscreen
        * @description If application is currently displaying an element as fullscreen, then stop and return to normal.
        * @param {Function} [success] Function called when transition to normal mode is finished
        */
        disableFullscreen: function (success) {
            // success callback
            var s = function () {
                success();
                document.removeEventListener('fullscreenchange', s);
            };

            if (success) {
                document.addEventListener('fullscreenchange', s, false);
            }

            document.exitFullscreen();
        },

        /**
        * @function
        * @name pc.fw.Application#isHidden
        * @description Returns true if the window or tab in which the application is running in is not visible to the user.
        */
        isHidden: function () {
            return document[this._hiddenAttr];
        },

        /**
        * @private
        * @function
        * @name pc.fw.Application#onVisibilityChange
        * @description Called when the visibility state of the current tab/window changes
        */
        onVisibilityChange: function (e) {
            if (this.isHidden()) {
                this.audioManager.suspend();
            } else {
                this.audioManager.resume();
            }
        },

        /**
        * @function
        * @name pc.fw.Application#resizeCanvas
        * @description Resize the canvas in line with the current FillMode
        * In KEEP_ASPECT mode, the canvas will grow to fill the window as best it can while maintaining the aspect ratio
        * In FILL_WINDOW mode, the canvas will simply fill the window, changing aspect ratio
        * In NONE mode, the canvas will always match the size provided
        * @param {Number} [width] The width of the canvas, only used in NONE mode
        * @param {Number} [height] The height of the canvas, only used in NONE mode
        * @returns {Object} A object containing the values calculated to use as width and height
        */
        resizeCanvas: function (width, height) {
            var windowWidth = window.innerWidth;
            var windowHeight = window.innerHeight;

            if (navigator.isCocoonJS) {
                width = windowWidth;
                height = windowHeight;

                var ratio = window.devicePixelRatio;
                this.graphicsDevice.resizeCanvas(width * ratio, height * ratio);
            } else {
                if (this.fillMode === pc.fw.FillMode.KEEP_ASPECT) {
                    var r = this.canvas.width/this.canvas.height;
                    var winR = windowWidth / windowHeight;

                    if (r > winR) {
                        width = windowWidth;
                        height = width / r ;
                    } else {
                        height = windowHeight;
                        width = height * r;
                    }
                } else if (this.fillMode === pc.fw.FillMode.FILL_WINDOW) {
                    width = windowWidth;
                    height = windowHeight;
                } else {
                    // FillMode.NONE use width and height that are provided
                }

                this.canvas.style.width = width + 'px';
                this.canvas.style.height = height + 'px';

                // In AUTO mode the resolution is changed to match the canvas size
                if (this.resolutionMode === pc.fw.ResolutionMode.AUTO) {
                    this.setCanvasResolution(pc.fw.ResolutionMode.AUTO);
                }
            }

            // return the final values calculated for width and height
            return {
                width: width,
                height: height
            };
        },

        /**
        * @private
        * @name pc.fw.Application#onLibrariesLoaded
        * @description Event handler called when all code libraries have been loaded
        * Code libraries are passed into the constructor of the Application and the application won't start running or load packs until all libraries have
        * been loaded
        */
        onLibrariesLoaded: function () {
            // Create systems that may require external libraries
            // var rigidbodysys = new pc.fw.RigidBodyComponentSystem(this.context);
            // var collisionsys = new pc.fw.CollisionComponentSystem(this.context);
            // var ballsocketjointsys = new pc.fw.BallSocketJointComponentSystem(this.context);

            this.context.systems.rigidbody.onLibraryLoaded();
            this.context.systems.collision.onLibraryLoaded();
        },

        /**
         * @function
         * @name pc.fw.Application#_handleMessage
         * @description Called when the LiveLink object receives a new message
         * @param {pc.fw.LiveLiveMessage} msg The received message
         */
        _handleMessage: function (msg) {
            var entity;

            switch(msg.type) {
                case pc.fw.LiveLinkMessageType.UPDATE_COMPONENT:
                    this._linkUpdateComponent(msg.content.id, msg.content.component, msg.content.attribute, msg.content.value);
                    break;
                case pc.fw.LiveLinkMessageType.UPDATE_ENTITY:
                    this._linkUpdateEntity(msg.content.id, msg.content.components);
                    break;
                case pc.fw.LiveLinkMessageType.UPDATE_ENTITY_TRANSFORM:
                    this._linkUpdateEntityTransform(msg.content.id, msg.content.position, msg.content.rotation, msg.content.scale);
                    break;
                case pc.fw.LiveLinkMessageType.UPDATE_ENTITY_NAME:
                    entity = this.context.root.findOne("getGuid", msg.content.id);
                    entity.setName(msg.content.name);
                    break;
                case pc.fw.LiveLinkMessageType.UPDATE_ENTITY_ENABLED:
                    entity = this.context.root.findOne("getGuid", msg.content.id);
                    entity.enabled = msg.content.enabled;
                    break;
                case pc.fw.LiveLinkMessageType.REPARENT_ENTITY:
                    this._linkReparentEntity(msg.content.id, msg.content.newParentId, msg.content.index);
                    break;
                case pc.fw.LiveLinkMessageType.CLOSE_ENTITY:
                    entity = this.context.root.findOne("getGuid", msg.content.id);
                    if(entity) {
                        logDEBUG(pc.string.format("RT: Removed '{0}' from parent {1}", msg.content.id, entity.getParent().getGuid()));
                        entity.destroy();
                    }
                    break;
                case pc.fw.LiveLinkMessageType.OPEN_PACK:
                    var pack = this.context.loader.open(pc.resources.PackRequest, msg.content.pack);

                    // Get the root entity back from the fake pack
                    var entity = pack.hierarchy;
                    if (entity.__parent) {
                        parent = this.context.root.findByGuid(entity.__parent);
                        parent.addChild(entity);
                    } else {
                        this.context.root.addChild(entity);
                    }
                    break;
                case pc.fw.LiveLinkMessageType.OPEN_ENTITY:
                    var parent;
                    var entities = {};
                    var guid = null;
                    if (msg.content.entity) {
                        // Create a fake little pack to open the entity hierarchy
                        var pack = {
                            application_data: {},
                            hierarchy: msg.content.entity
                        };
                        pack = this.context.loader.open(pc.resources.PackRequest, pack);

                        // Get the root entity back from the fake pack
                        entity = pack.hierarchy;
                        if (entity.__parent) {
                            parent = this.context.root.findByGuid(entity.__parent);
                            parent.addChild(entity);
                        } else {
                            this.context.root.addChild(entity);
                        }
                    }
                    break;
                case pc.fw.LiveLinkMessageType.UPDATE_ASSET:
                    this._linkUpdateAsset(msg.content.id, msg.content.attribute, msg.content.value);
                    break;

                case pc.fw.LiveLinkMessageType.UPDATE_ASSETCACHE:
                    var resourceId;

                    // Add new and Update existing assets
                    for (resourceId in msg.content.assets) {
                        var asset = this.context.assets.getAssetByResourceId(resourceId);
                        if (!asset) {
                            var assetData = msg.content.assets[resourceId];
                            this.context.assets.createAndAddAsset(resourceId, assetData);
                        } else {
                            pc.extend(asset, msg.content.assets[resourceId]);
                        }
                    }

                    // Delete removed assets
                    for (resourceId in msg.content.deleted) {
                        var asset = this.context.assets.getAssetByResourceId(resourceId);
                        if (asset) {
                            this.context.assets.removeAsset(asset);
                        }
                    }
                    break;

                case pc.fw.LiveLinkMessageType.UPDATE_PACK_SETTINGS:
                    this._linkUpdatePackSettings(msg.content.settings);
                    break;
            }
        },

        /**
         * @function
         * @name pc.fw.Application#_linkUpdateComponent
         * @description Update a value on a component,
         * @param {String} guid GUID for the entity
         * @param {String} componentName name of the component to update
         * @param {String} attributeName name of the attribute on the component
         * @param {Object} value - value to set attribute to
         */
        _linkUpdateComponent: function(guid, componentName, attributeName, value) {
            var entity = this.context.root.findOne("getGuid", guid);
            var attribute;

            if (entity) {
                if(componentName) {
                    if(entity[componentName]) {
                        attribute = editor.link.exposed[componentName][attributeName];
                        if (editor && attribute) {
                            // Override Type provided
                            if (attribute.RuntimeType) {
                                    if (attribute.RuntimeType === pc.Vec3) {
                                        entity[componentName][attributeName] = new attribute.RuntimeType(value[0], value[1], value[2]);
                                    } else if (attribute.RuntimeType === pc.Vec4) {
                                        entity[componentName][attributeName] = new attribute.RuntimeType(value[0], value[1], value[2], value[3]);
                                    } else if (attribute.RuntimeType === pc.Vec2) {
                                        entity[componentName][attributeName] = new attribute.RuntimeType(value[0], value[1]);
                                    } else if (attribute.RuntimeType === pc.Color) {
                                        if (value.length === 3) {
                                            entity[componentName][attributeName] = new attribute.RuntimeType(value[0], value[1], value[2]);
                                        } else {
                                            entity[componentName][attributeName] = new attribute.RuntimeType(value[0], value[1], value[2], value[3]);
                                        }
                                    } else {
                                        entity[componentName][attributeName] = new attribute.RuntimeType(value);
                                    }
                            } else {
                                entity[componentName][attributeName] = value;
                            }
                        } else {
                            entity[componentName][attributeName] = value;
                        }


                    } else {
                        logWARNING(pc.string.format("No component system called '{0}' exists", componentName));
                    }
                } else {
                    // set value on node
                    entity[attributeName] = value;
                }
            }
        },

        _linkUpdateEntityTransform: function (guid, position, rotation, scale) {
            var entity = this.context.root.findByGuid(guid);
            if(entity) {
                entity.setLocalPosition(position[0], position[1], position[2]);
                entity.setLocalEulerAngles(rotation[0], rotation[1], rotation[2]);
                entity.setLocalScale(scale[0], scale[1], scale[2]);

                // Fire event to notify listeners that the transform has been changed by an external tool
                entity.fire('livelink:updatetransform', position, rotation, scale);
            }
        },

        _linkReparentEntity: function (guid, parentId, index) {
            var entity = this.context.root.findByGuid(guid);
            var parent = this.context.root.findByGuid(parentId);
            // TODO: use index to insert child into child list
            entity.reparent(parent);
        },

        /**
         * @function
         * @name pc.fw.Application#_updateEntity
         * @description Update an Entity from a set of components, deletes components that are no longer there, adds components that are new.
         * Note this does not update the data inside the components, just whether or not a component is present.
         * @param {Object} guid GUID of the entity
         * @param {Object} components Component object keyed by component name.
         */
        _linkUpdateEntity: function (guid, components) {
            var type;
            var entity = this.context.root.findOne("getGuid", guid);

            if(entity) {
                var order = this.context.systems.getComponentSystemOrder();

                var i, len = order.length;
                for(i = 0; i < len; i++) {
                    type = order[i];
                    if(components.hasOwnProperty(type) && this.context.systems.hasOwnProperty(type)) {
                        if (!entity[type]) {
                            this.context.systems[type].addComponent(entity, {});
                        }
                    }
                }

                for(type in this.context.systems) {
                    if(type === "gizmo" || type === "pick") {
                        continue;
                    }

                    if(this.context.systems.hasOwnProperty(type)) {
                        if(!components.hasOwnProperty(type) && entity[type]) {
                            this.context.systems[type].removeComponent(entity);
                        }
                    }
                }
            }
        },

        _linkUpdateAsset: function (guid, attribute, value) {
            var asset = this.context.assets.getAssetByResourceId(guid);
            if (asset) {
                asset[attribute] = value;
                asset.fire('change', asset, attribute, value);
            }
        },

        _linkUpdatePackSettings: function (settings) {
            var ambient = settings.render.global_ambient;
            this.context.scene.ambientLight.set(ambient[0], ambient[1], ambient[2]);

            if (this.context.systems.rigidbody && typeof(Ammo) !== 'undefined') {
                var gravity = settings.physics.gravity;
                this.context.systems.rigidbody.setGravity(gravity[0], gravity[1], gravity[2]);
            }

            this.context.scene.fog = settings.render.fog;
            this.context.scene.fogStart = settings.render.fog_start;
            this.context.scene.fogEnd = settings.render.fog_end;

            var fog = settings.render.fog_color;
            this.context.scene.fogColor = new pc.Color(fog[0], fog[1], fog[2]);
            this.context.scene.fogDensity = settings.render.fog_density;

            this.context.scene.shadowDistance = settings.render.shadow_distance;
        }
    };

    return {
        FillMode: {
            /**
            * @enum pc.fw.FillMode
            * @name pc.fw.FillMode.NONE
            * @description When resizing the window the size of the canvas will not change.
            */
            NONE: 'NONE',
            /**
            * @enum pc.fw.FillMode
            * @name pc.fw.FillMode.FILL_WINDOW
            * @description When resizing the window the size of the canvas will change to fill the window exactly.
            */
            FILL_WINDOW: 'FILL_WINDOW',
            /**
            * @enum pc.fw.FillMode
            * @name pc.fw.FillMode.KEEP_ASPECT
            * @description When resizing the window the size of the canvas will change to fill the window as best it can, while maintaining the same aspect ratio.
            */
            KEEP_ASPECT: 'KEEP_ASPECT'
        },
        ResolutionMode: {
            /**
            * @enum pc.fw.ResolutionMode
            * @name pc.fw.ResolutionMode.AUTO
            * @description When the canvas is resized the resolution of the canvas will change to match the size of the canvas.
            */
            AUTO: 'AUTO',
            /**
            * @enum pc.fw.ResolutionMode
            * @name pc.fw.ResolutionMode.FIXED
            * @description When the canvas is resized the resolution of the canvas will remain at the same value and the output will just be scaled to fit the canvas.
            */
            FIXED: 'FIXED'
        },
        Application: Application
    };
} ());




