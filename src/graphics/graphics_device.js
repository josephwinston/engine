pc.gfx.precalculatedTangents = true;

pc.extend(pc.gfx, function () {

    var EVENT_RESIZE = 'resizecanvas';

    // Exceptions
    function UnsupportedBrowserError(message) {
        this.name = "UnsupportedBrowserError";
        this.message = (message || "");
    }
    UnsupportedBrowserError.prototype = Error.prototype;

    function ContextCreationError(message) {
        this.name = "ContextCreationError";
        this.message = (message || "");
    }
    ContextCreationError.prototype = Error.prototype;

    var _contextLostHandler = function () {
        logWARNING("Context lost.");
    };

    var _contextRestoredHandler = function () {
        logINFO("Context restored.");
    };

    var _createContext = function (canvas, options) {
        var names = ["webgl", "experimental-webgl", "webkit-3d", "moz-webgl"];
        var context = null;
        for (var i = 0; i < names.length; i++) {
            try {
                context = canvas.getContext(names[i], options);
            } catch(e) {}
            if (context) {
                break;
            }
        }
        return context;
    };

    /**
     * @name pc.gfx.Device
     * @class The graphics device manages the underlying graphics context. It is responsible
     * for submitting render state changes and graphics primitives to the hardware. A graphics
     * device is tied to a specific canvas HTML element. It is valid to have more than one
     * canvas element per page and create a new graphics device against each.
     * @constructor Creates a new graphics device.
     * @param {Object} canvas The canvas to which the graphics device is tied.
     * @property {Number} width Width of the back buffer in pixels (read-only).
     * @property {Number} height Height of the back buffer in pixels (read-only).
     * is attached is fullscreen or not.
     */

     /**
     * @event
     * @name pc.gfx.Device#resizecanvas
     * @description The 'resizecanvas' event is fired when the canvas is resized
     * @param {Number} width The new width of the canvas in pixels
     * @param {Number} height The new height of the canvas in pixels
    */
    var Device = function (canvas) {
        this.gl = undefined;
        this.canvas = canvas;
        this.shader = null;
        this.indexBuffer = null;
        this.vertexBuffers = [];
        this.precision = "highp";
        this.attributesInvalidated = true;
        this.boundBuffer = null;
        this.enabledAttributes = {};
        this.textureUnits = [];
        this.commitFunction = {};

        if (!window.WebGLRenderingContext) {
            throw new pc.gfx.UnsupportedBrowserError();
        }

        // Retrieve the WebGL context
        this.gl = _createContext(canvas, {alpha: false});

        if (!this.gl) {
            throw new pc.gfx.ContextCreationError();
        }

        // put the rest of the contructor in a function
        // so that the constructor remains small. Small constructors
        // are optimized by Firefox due to type inference
        (function() {

            canvas.addEventListener("webglcontextlost", _contextLostHandler, false);
            canvas.addEventListener("webglcontextrestored", _contextRestoredHandler, false);

            this.canvas        = canvas;
            this.shader        = null;
            this.indexBuffer   = null;
            this.vertexBuffers = [];
            this.precision     = 'highp';

            var gl = this.gl;
            logINFO("Device started");
            logINFO("WebGL version:                " + gl.getParameter(gl.VERSION));
            logINFO("WebGL shader version:         " + gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
            logINFO("WebGL vendor:                 " + gl.getParameter(gl.VENDOR));
            logINFO("WebGL renderer:               " + gl.getParameter(gl.RENDERER));
            logINFO("WebGL extensions:             " + gl.getSupportedExtensions());
            logINFO("WebGL max vertex attribs:     " + gl.getParameter(gl.MAX_VERTEX_ATTRIBS));
            logINFO("WebGL max vshader vectors:    " + gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS));
            logINFO("WebGL max varying vectors:    " + gl.getParameter(gl.MAX_VARYING_VECTORS));
            logINFO("WebGL max fshader vectors:    " + gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS));

            logINFO("WebGL max combined tex units: " + gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS));
            logINFO("WebGL max vertex tex units:   " + gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS));
            logINFO("WebGL max tex units:          " + gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS));

            logINFO("WebGL max texture size:       " + gl.getParameter(gl.MAX_TEXTURE_SIZE));
            logINFO("WebGL max cubemap size:       " + gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE));

            // Query the precision supported by ints and floats in vertex and fragment shaders
            var vertexShaderPrecisionHighpFloat = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT);
            var vertexShaderPrecisionMediumpFloat = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.MEDIUM_FLOAT);
            var vertexShaderPrecisionLowpFloat = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.LOW_FLOAT);

            var fragmentShaderPrecisionHighpFloat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
            var fragmentShaderPrecisionMediumpFloat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT );
            var fragmentShaderPrecisionLowpFloat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.LOW_FLOAT);

            var vertexShaderPrecisionHighpInt = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_INT);
            var vertexShaderPrecisionMediumpInt = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.MEDIUM_INT);
            var vertexShaderPrecisionLowpInt = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.LOW_INT);

            var fragmentShaderPrecisionHighpInt = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_INT);
            var fragmentShaderPrecisionMediumpInt = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_INT);
            var fragmentShaderPrecisionLowpInt = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.LOW_INT);

            var highpAvailable = vertexShaderPrecisionHighpFloat.precision > 0 && fragmentShaderPrecisionHighpFloat.precision > 0;
            var mediumpAvailable = vertexShaderPrecisionMediumpFloat.precision > 0 && fragmentShaderPrecisionMediumpFloat.precision > 0;

            if (!highpAvailable) {
                if (mediumpAvailable) {
                    this.precision = "mediump";
                    console.warn("WARNING: highp not supported, using mediump");
                } else {
                    this.precision = "lowp";
                    console.warn( "WARNING: highp and mediump not supported, using lowp" );
                }
            }

            this.defaultClearOptions = {
                color: [0, 0, 0, 1],
                depth: 1,
                flags: pc.gfx.CLEARFLAG_COLOR | pc.gfx.CLEARFLAG_DEPTH
            };

            this.glPrimitive = [
                gl.POINTS,
                gl.LINES,
                gl.LINE_STRIP,
                gl.TRIANGLES,
                gl.TRIANGLE_STRIP
            ];

            this.glBlendEquation = [
                gl.FUNC_ADD,
                gl.FUNC_SUBTRACT,
                gl.FUNC_REVERSE_SUBTRACT
            ];

            this.glBlendFunction = [
                gl.ZERO,
                gl.ONE,
                gl.SRC_COLOR,
                gl.ONE_MINUS_SRC_COLOR,
                gl.DST_COLOR,
                gl.ONE_MINUS_DST_COLOR,
                gl.SRC_ALPHA,
                gl.SRC_ALPHA_SATURATE,
                gl.ONE_MINUS_SRC_ALPHA,
                gl.DST_ALPHA,
                gl.ONE_MINUS_DST_ALPHA
            ];

            this.glClearFlag = [
                0,
                gl.COLOR_BUFFER_BIT,
                gl.DEPTH_BUFFER_BIT,
                gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT,
                gl.STENCIL_BUFFER_BIT,
                gl.STENCIL_BUFFER_BIT | gl.COLOR_BUFFER_BIT,
                gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT,
                gl.STENCIL_BUFFER_BIT | gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT
            ];

            this.glType = [
                gl.BYTE,
                gl.UNSIGNED_BYTE,
                gl.SHORT,
                gl.UNSIGNED_SHORT,
                gl.INT,
                gl.UNSIGNED_INT,
                gl.FLOAT
            ];

            // Initialize extensions
            this.extTextureFloat = gl.getExtension("OES_texture_float");
            this.extDepthTexture = null; //gl.getExtension("WEBKIT_WEBGL_depth_texture");
            this.extStandardDerivatives = gl.getExtension("OES_standard_derivatives");
            if (this.extStandardDerivatives) {
                gl.hint(this.extStandardDerivatives.FRAGMENT_SHADER_DERIVATIVE_HINT_OES, gl.NICEST);
            }

            this.maxTextureMaxAnisotropy = 1;
            this.extTextureFilterAnisotropic = gl.getExtension('EXT_texture_filter_anisotropic');
            if (!this.extTextureFilterAnisotropic) {
                this.extTextureFilterAnisotropic = gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
            }
            if (this.extTextureFilterAnisotropic) {
                this.maxTextureMaxAnisotropy = gl.getParameter(this.extTextureFilterAnisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
            }
            this.extCompressedTextureS3TC = gl.getExtension('WEBKIT_WEBGL_compressed_texture_s3tc');
            if (this.extCompressedTextureS3TC) {
                var formats = gl.getParameter(gl.COMPRESSED_TEXTURE_FORMATS);
                var formatMsg = "WebGL compressed texture formats:";
                for (var i = 0; i < formats.length; i++) {
                    switch (formats[i]) {
                        case this.extCompressedTextureS3TC.COMPRESSED_RGB_S3TC_DXT1_EXT:
                            formatMsg += ' COMPRESSED_RGB_S3TC_DXT1_EXT';
                            break;
                        case this.extCompressedTextureS3TC.COMPRESSED_RGBA_S3TC_DXT1_EXT:
                            formatMsg += ' COMPRESSED_RGBA_S3TC_DXT1_EXT';
                            break;
                        case this.extCompressedTextureS3TC.COMPRESSED_RGBA_S3TC_DXT3_EXT:
                            formatMsg += ' COMPRESSED_RGBA_S3TC_DXT3_EXT';
                            break;
                        case this.extCompressedTextureS3TC.COMPRESSED_RGBA_S3TC_DXT5_EXT:
                            formatMsg += ' COMPRESSED_RGBA_S3TC_DXT5_EXT';
                            break;
                        default:
                            formatMsg += ' UNKOWN(' + formats[i] + ')';
                            break;
                    }
                }
                logINFO(formatMsg);
            }
            this.extDrawBuffers = gl.getExtension('EXT_draw_buffers');
            if (this.extDrawBuffers) {
                logINFO("WebGL max draw buffers:       " + gl.getParameter(this.extDrawBuffers.MAX_DRAW_BUFFERS_EXT));
                logINFO("WebGL max color attachments:  " + gl.getParameter(this.extDrawBuffers.MAX_COLOR_ATTACHMENTS_EXT));
            } else {
                logINFO("WebGL max draw buffers:       " + 1);
                logINFO("WebGL max color attachments:  " + 1);
            }

            // Create the default render target
            this.renderTarget = null;

            // Create the ScopeNamespace for shader attributes and variables
            this.scope = new pc.gfx.ScopeSpace("Device");

            // Define the uniform commit functions
            this.commitFunction = {};
            this.commitFunction[pc.gfx.ShaderInputType.BOOL ] = function (locationId, value) { gl.uniform1i(locationId, value); };
            this.commitFunction[pc.gfx.ShaderInputType.INT  ] = function (locationId, value) { gl.uniform1i(locationId, value); };
            this.commitFunction[pc.gfx.ShaderInputType.FLOAT] = function (locationId, value) {
                if (typeof value == "number")
                    gl.uniform1f(locationId, value);
                else
                    gl.uniform1fv(locationId, value);
                };
            this.commitFunction[pc.gfx.ShaderInputType.VEC2 ] = function (locationId, value) { gl.uniform2fv(locationId, value); };
            this.commitFunction[pc.gfx.ShaderInputType.VEC3 ] = function (locationId, value) { gl.uniform3fv(locationId, value); };
            this.commitFunction[pc.gfx.ShaderInputType.VEC4 ] = function (locationId, value) { gl.uniform4fv(locationId, value); };
            this.commitFunction[pc.gfx.ShaderInputType.IVEC2] = function (locationId, value) { gl.uniform2iv(locationId, value); };
            this.commitFunction[pc.gfx.ShaderInputType.BVEC2] = function (locationId, value) { gl.uniform2iv(locationId, value); };
            this.commitFunction[pc.gfx.ShaderInputType.IVEC3] = function (locationId, value) { gl.uniform3iv(locationId, value); };
            this.commitFunction[pc.gfx.ShaderInputType.BVEC3] = function (locationId, value) { gl.uniform3iv(locationId, value); };
            this.commitFunction[pc.gfx.ShaderInputType.IVEC4] = function (locationId, value) { gl.uniform4iv(locationId, value); };
            this.commitFunction[pc.gfx.ShaderInputType.BVEC4] = function (locationId, value) { gl.uniform4iv(locationId, value); };
            this.commitFunction[pc.gfx.ShaderInputType.MAT2 ] = function (locationId, value) { gl.uniformMatrix2fv(locationId, false, value); };
            this.commitFunction[pc.gfx.ShaderInputType.MAT3 ] = function (locationId, value) { gl.uniformMatrix3fv(locationId, false, value); };
            this.commitFunction[pc.gfx.ShaderInputType.MAT4 ] = function (locationId, value) { gl.uniformMatrix4fv(locationId, false, value); };

            // Set the initial render state
            this.setBlending(false);
            this.setBlendFunction(pc.gfx.BLENDMODE_ONE, pc.gfx.BLENDMODE_ZERO);
            this.setBlendEquation(pc.gfx.BLENDEQUATION_ADD);
            this.setColorWrite(true, true, true, true);
            this.setCullMode(pc.gfx.CULLFACE_BACK);
            this.setDepthTest(true);
            this.setDepthWrite(true);

            this.setClearDepth(1);
            this.setClearColor(0, 0, 0, 0);

            gl.enable(gl.SCISSOR_TEST);

            this.programLib = new pc.gfx.ProgramLibrary(this);
            for (var generator in pc.gfx.programlib) {
                this.programLib.register(generator, pc.gfx.programlib[generator]);
            }

            // Calculate a estimate of the maximum number of bones that can be uploaded to the GPU
            // based on the number of available uniforms and the number of uniforms required for non-
            // bone data.  This is based off of the Phong shader.  A user defined shader may have
            // even less space available for bones so this calculated value can be overridden via
            // pc.gfx.Device.setBoneLimit.
            var numUniforms = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
            numUniforms -= 4 * 4; // Model, view, projection and shadow matrices
            numUniforms -= 8;     // 8 lights max, each specifying a position vector
            numUniforms -= 1;     // Eye position
            numUniforms -= 4 * 4; // Up to 4 texture transforms
            this.boneLimit = Math.floor(numUniforms / 4);
            // HACK: If the number of bones is above ~120-124, performance on the Mac Mini
            // degrades drastically
            if (this.boneLimit > 110) {
                this.boneLimit = 110;
            }

            pc.events.attach(this);

            this.boundBuffer = null;

            this.textureUnits = [];

            this.attributesInvalidated = true;

            this.enabledAttributes = {};

            // Handle IE11's inability to take UNSIGNED_BYTE as a param for vertexAttribPointer
            var bufferId = gl.createBuffer();
            var storage = new ArrayBuffer(16);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
            gl.bufferData(gl.ARRAY_BUFFER, storage, gl.STATIC_DRAW);
            gl.getError(); // Clear error flag
            gl.vertexAttribPointer(0, 4, gl.UNSIGNED_BYTE, false, 4, 0);
            this.supportsUnsignedByte = (gl.getError() === 0);
            gl.deleteBuffer(bufferId);


        }).call(this);

    };

    Device.prototype = {
        /**
         * @function
         * @name pc.gfx.Device#setViewport
         * @description Set the active rectangle for rendering on the specified device.
         * @param {Number} x The pixel space x-coordinate of the bottom left corner of the viewport.
         * @param {Number} y The pixel space y-coordinate of the bottom left corner of the viewport.
         * @param {Number} w The width of the viewport in pixels.
         * @param {Number} h The height of the viewport in pixels.
         */
        setViewport: function (x, y, width, height) {
            var gl = this.gl;
            gl.viewport(x, y, width, height);
        },

        /**
         * @function
         * @name pc.gfx.Device#setScissor
         * @description Set the active scissor rectangle on the specified device.
         * @param {Number} x The pixel space x-coordinate of the bottom left corner of the scissor rectangle.
         * @param {Number} y The pixel space y-coordinate of the bottom left corner of the scissor rectangle.
         * @param {Number} w The width of the scissor rectangle in pixels.
         * @param {Number} h The height of the scissor rectangle in pixels.
         */
        setScissor: function (x, y, width, height) {
            var gl = this.gl;
            gl.scissor(x, y, width, height);
        },

        /**
         * @function
         * @name pc.gfx.Device#getProgramLibrary
         * @description Retrieves the program library assigned to the specified graphics device.
         * @returns {pc.gfx.ProgramLibrary} The program library assigned to the device.
         */
        getProgramLibrary: function () {
            return this.programLib;
        },

        /**
         * @function
         * @name pc.gfx.Device#setProgramLibrary
         * @description Assigns a program library to the specified device. By default, a graphics
         * device is created with a program library that manages all of the programs that are
         * used to render any graphical primitives. However, this function allows the user to
         * replace the existing program library with a new one.
         * @param {pc.gfx.ProgramLibrary} programLib The program library to assign to the device.
         */
        setProgramLibrary: function (programLib) {
            this.programLib = programLib;
        },

        /**
         * @function
         * @name pc.gfx.Device#updateBegin
         * @description Marks the beginning of a block of rendering. Internally, this function
         * binds the render target currently set on the device. This function should be matched
         * with a call to pc.gfx.Device#updateEnd. Calls to pc.gfx.Device#updateBegin
         * and pc.gfx.Device#updateEnd must not be nested.
         */
        updateBegin: function () {
            logASSERT(this.canvas !== null, "Device has not been started");

            this.boundBuffer = null;
            this.indexBuffer = null;

            // Set the render target
            if (this.renderTarget) {
                this.renderTarget.bind();
            } else {
                var gl = this.gl;
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }

            for (var i = 0; i < 16; i++) {
                this.textureUnits[i] = null;
            }
        },

        /**
         * @function
         * @name pc.gfx.Device#updateEnd
         * @description Marks the end of a block of rendering. This function should be called
         * after a matching call to pc.gfx.Device#updateBegin. Calls to pc.gfx.Device#updateBegin
         * and pc.gfx.Device#updateEnd must not be nested.
         */
        updateEnd: function () {
        },

        /**
         * @function
         * @name pc.gfx.Device#draw
         * @description Submits a graphical primitive to the hardware for immediate rendering.
         * @param {Object} primitive Primitive object describing how to submit current vertex/index buffers defined as follows:
         * @param {pc.gfx.PRIMITIVE} primitive.type The type of primitive to render.
         * @param {Number} primitive.base The offset of the first index or vertex to dispatch in the draw call.
         * @param {Number} primitive.count The number of indices or vertices to dispatch in the draw call.
         * @param {Boolean} primitive.indexed True to interpret the primitive as indexed, thereby using the currently set index buffer and false otherwise.
         * @example
         * // Render a single, unindexed triangle
         * device.draw({
         *     type: pc.gfx.PRIMITIVE_TRIANGLES,
         *     base: 0,
         *     count: 3,
         *     indexed: false
         * )};
         */
        draw: function (primitive) {
            var gl = this.gl;

            var i, j, len, sampler, samplerValue, texture, numTextures, uniform, scopeId, uniformVersion, programVersion;
            var shader = this.shader;
            var samplers = shader.samplers;
            var uniforms = shader.uniforms;

            // Commit the vertex buffer inputs
            if (this.attributesInvalidated) {
                var attribute, element, vertexBuffer;
                var attributes = shader.attributes;

                for (i = 0, len = attributes.length; i < len; i++) {
                    attribute = attributes[i];

                    // Retrieve vertex element for this shader attribute
                    element = attribute.scopeId.value;

                    // Check the vertex element is valid
                    if (element !== null) {
                        // Retrieve the vertex buffer that contains this element
                        vertexBuffer = this.vertexBuffers[element.stream];

                        // Set the active vertex buffer object
                        if (this.boundBuffer !== vertexBuffer.bufferId) {
                            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer.bufferId);
                            this.boundBuffer = vertexBuffer.bufferId;
                        }

                        // Hook the vertex buffer to the shader program
                        if (!this.enabledAttributes[attribute.locationId]) {
                            gl.enableVertexAttribArray(attribute.locationId);
                            this.enabledAttributes[attribute.locationId] = true;
                        }
                        gl.vertexAttribPointer(attribute.locationId,
                                               element.numComponents,
                                               this.glType[element.dataType],
                                               element.normalize,
                                               element.stride,
                                               element.offset);
                    }
                }

                this.attributesInvalidated = false;
            }

            // Commit the shader program variables
            textureUnit = 0;
            for (i = 0, len = samplers.length; i < len; i++) {
                sampler = samplers[i];
                samplerValue = sampler.scopeId.value;

                if (samplerValue instanceof pc.gfx.Texture) {
                    texture = samplerValue;
                    if (this.textureUnits[textureUnit] !== texture) {
                        gl.activeTexture(gl.TEXTURE0 + textureUnit);
                        texture.bind();
                        this.textureUnits[textureUnit] = texture;
                    }
                    if (sampler.slot !== textureUnit) {
                        gl.uniform1i(sampler.locationId, textureUnit);
                        sampler.slot = textureUnit;
                    }
                    textureUnit++;
                } else { // Array
                    sampler.array.length = 0;
                    numTexures = samplerValue.length;
                    for (j = 0; j < numTexures; j++) {
                        texture = samplerValue[j];
                        if (this.textureUnits[textureUnit] !== texture) {
                            gl.activeTexture(gl.TEXTURE0 + textureUnit);
                            texture.bind();
                            this.textureUnits[textureUnit] = texture;
                        }
                        sampler.array[j] = textureUnit;
                        textureUnit++;
                    }
                    gl.uniform1iv(sampler.locationId, sampler.array);
                }
            }

            // Commit any updated uniforms
            for (i = 0, len = uniforms.length; i < len; i++) {
                uniform = uniforms[i];
                scopeId = uniform.scopeId;
                uniformVersion = uniform.version;
                programVersion = scopeId.versionObject.version;

                // Check the value is valid
                if (uniformVersion.globalId !== programVersion.globalId || uniformVersion.revision !== programVersion.revision) {
                    uniformVersion.globalId = programVersion.globalId;
                    uniformVersion.revision = programVersion.revision;

                    // Call the function to commit the uniform value
                    this.commitFunction[uniform.dataType](uniform.locationId, scopeId.value);
                }
            }

            if (primitive.indexed) {
                gl.drawElements(this.glPrimitive[primitive.type],
                                primitive.count,
                                this.indexBuffer.glFormat,
                                primitive.base * 2);
            } else {
                gl.drawArrays(this.glPrimitive[primitive.type],
                              primitive.base,
                              primitive.count);
            }
        },

        /**
         * @function
         * @name pc.gfx.Device#clear
         * @description Clears the frame buffer of the currently set render target.
         * @param {Object} options Optional options object that controls the behavior of the clear operation defined as follows:
         * @param {Array} options.color The color to clear the color buffer to in the range 0.0 to 1.0 for each component.
         * @param {Number} options.depth The depth value to clear the depth buffer to in the range 0.0 to 1.0.
         * @param {pc.gfx.CLEARFLAG} options.flags The buffers to clear (the types being color, depth and stencil).
         * @example
         * // Clear color buffer to black and depth buffer to 1.0
         * device.clear();
         *
         * // Clear just the color buffer to red
         * device.clear({
         *     color: [1, 0, 0, 1],
         *     flags: pc.gfx.CLEARFLAG_COLOR
         * });
         *
         * // Clear color buffer to yellow and depth to 1.0
         * device.clear({
         *     color: [1, 1, 0, 1],
         *     depth: 1.0,
         *     flags: pc.gfx.CLEARFLAG_COLOR | pc.gfx.CLEARFLAG_DEPTH
         * });
         */
        clear: function (options) {
            var defaultOptions = this.defaultClearOptions;
            options = options || defaultOptions;

            var flags = (options.flags === undefined) ? defaultOptions.flags : options.flags;
            if (flags !== 0) {
                // Set the clear color
                if (flags & pc.gfx.CLEARFLAG_COLOR) {
                    var color = (options.color === undefined) ? defaultOptions.color : options.color;
                    this.setClearColor(color[0], color[1], color[2], color[3]);
                }

                if (flags & pc.gfx.CLEARFLAG_DEPTH) {
                    // Set the clear depth
                    var depth = (options.depth === undefined) ? defaultOptions.depth : options.depth;
                    this.setClearDepth(depth);
                }

                // Clear the frame buffer
                this.gl.clear(this.glClearFlag[flags]);
            }
        },

        setClearDepth: function (depth) {
            if (depth !== this.clearDepth) {
                this.gl.clearDepth(depth);
                this.clearDepth = depth;
            }
        },

        setClearColor: function (r, g, b, a) {
            if ((r !== this.clearRed) || (g !== this.clearGreen) || (b !== this.clearBlue) || (a !== this.clearAlpha)) {
                this.gl.clearColor(r, g, b, a);
                this.clearRed = r;
                this.clearGreen = g;
                this.clearBlue = b;
                this.clearAlpha = a;
            }
        },

        /**
         * @function
         * @name pc.gfx.Device#setRenderTarget
         * @description Sets the specified render target on the device. If null
         * is passed as a parameter, the back buffer becomes the current target
         * for all rendering operations.
         * @param {pc.gfx.RenderTarget} The render target to activate.
         * @example
         * // Set a render target to receive all rendering output
         * device.setRenderTarget(renderTarget);
         *
         * // Set the back buffer to receive all rendering output
         * device.setRenderTarget(null);
         */
        setRenderTarget: function (renderTarget) {
            this.renderTarget = renderTarget;
        },

        /**
         * @function
         * @name pc.gfx.Device#getRenderTarget
         * @description Queries the currently set render target on the device.
         * @returns {pc.gfx.RenderTarget} The current render target.
         * @example
         * // Get the current render target
         * var renderTarget = device.getRenderTarget();
         */
        getRenderTarget: function () {
            return this.renderTarget;
        },

        /**
         * @function
         * @name pc.gfx.Device#getDepthTest
         * @description Queries whether depth testing is enabled.
         * @returns {Boolean} true if depth testing is enabled and false otherwise.
         * @example
         * var depthTest = device.getDepthTest();
         * console.log('Depth testing is ' + depthTest ? 'enabled' : 'disabled');
         */
        getDepthTest: function () {
            return this.depthTest;
        },

        /**
         * @function
         * @name pc.gfx.Device#setDepthTest
         * @description Enables or disables depth testing of fragments. Once this state
         * is set, it persists until it is changed. By default, depth testing is enabled.
         * @param {Boolean} depthTest true to enable depth testing and false otherwise.
         * @example
         * device.setDepthTest(true);
         */
        setDepthTest: function (depthTest) {
            if (this.depthTest !== depthTest) {
                var gl = this.gl;
                if (depthTest) {
                    gl.enable(gl.DEPTH_TEST);
                } else {
                    gl.disable(gl.DEPTH_TEST);
                }
                this.depthTest = depthTest;
            }
        },

        /**
         * @function
         * @name pc.gfx.Device#getDepthWrite
         * @description Queries whether writes to the depth buffer are enabled.
         * @returns {Boolean} true if depth writing is enabled and false otherwise.
         * @example
         * var depthWrite = device.getDepthWrite();
         * console.log('Depth writing is ' + depthWrite ? 'enabled' : 'disabled');
         */
        getDepthWrite: function () {
            return this.depthWrite;
        },

        /**
         * @function
         * @name pc.gfx.Device#setDepthWrite
         * @description Enables or disables writes to the depth buffer. Once this state
         * is set, it persists until it is changed. By default, depth writes are enabled.
         * @param {Boolean} writeDepth true to enable depth writing and false otherwise.
         * @example
         * device.setDepthWrite(true);
         */
        setDepthWrite: function (writeDepth) {
            if (this.depthWrite !== writeDepth) {
                this.gl.depthMask(writeDepth);
                this.depthWrite = writeDepth;
            }
        },

        /**
         * @function
         * @name pc.gfx.Device#setColorWrite
         * @description Enables or disables writes to the color buffer. Once this state
         * is set, it persists until it is changed. By default, color writes are enabled
         * for all color channels.
         * @param {Boolean} writeRed true to enable writing  of the red channel and false otherwise.
         * @param {Boolean} writeGreen true to enable writing  of the green channel and false otherwise.
         * @param {Boolean} writeBlue true to enable writing  of the blue channel and false otherwise.
         * @param {Boolean} writeAlpha true to enable writing  of the alpha channel and false otherwise.
         * @example
         * // Just write alpha into the frame buffer
         * device.setColorWrite(false, false, false, true);
         */
        setColorWrite: function (writeRed, writeGreen, writeBlue, writeAlpha) {
            if ((this.writeRed !== writeRed) ||
                (this.writeGreen !== writeGreen) ||
                (this.writeBlue !== writeBlue) ||
                (this.writeAlpha !== writeAlpha)) {
                this.gl.colorMask(writeRed, writeGreen, writeBlue, writeAlpha);
                this.writeRed = writeRed;
                this.writeGreen = writeGreen;
                this.writeBlue = writeBlue;
                this.writeAlpha = writeAlpha;
            }
        },

        /**
         * @function
         * @name pc.gfx.Device#getBlending
         */
        getBlending: function () {
            return this.blending;
        },

        /**
         * @function
         * @name pc.gfx.Device#setBlending
         */
        setBlending: function (blending) {
            if (this.blending !== blending) {
                var gl = this.gl;
                if (blending) {
                    gl.enable(gl.BLEND);
                } else {
                    gl.disable(gl.BLEND);
                }
                this.blending = blending;
            }
        },

        /**
         * @function
         * @name pc.gfx.Device#setBlendFunction
         */
        setBlendFunction: function (blendSrc, blendDst) {
            if ((this.blendSrc !== blendSrc) || (this.blendDst !== blendDst)) {
                this.gl.blendFunc(this.glBlendFunction[blendSrc], this.glBlendFunction[blendDst]);
                this.blendSrc = blendSrc;
                this.blendDst = blendDst;
            }
        },

        /**
         * @function
         * @name pc.gfx.Device#setBlendEquation
         */
        setBlendEquation: function (blendEquation) {
            if (this.blendEquation !== blendEquation) {
                var gl = this.gl;
                gl.blendEquation(this.glBlendEquation[blendEquation]);
                this.blendEquation = blendEquation;
            }
        },

        /**
         * @function
         * @name pc.gfx.Device#setCullMode
         */
        setCullMode: function (cullMode) {
            if (this.cullMode !== cullMode) {
                var gl = this.gl;
                switch (cullMode) {
                    case pc.gfx.CULLFACE_NONE:
                        gl.disable(gl.CULL_FACE);
                        break;
                    case pc.gfx.CULLFACE_FRONT:
                        gl.enable(gl.CULL_FACE);
                        gl.cullFace(gl.FRONT);
                        break;
                    case pc.gfx.CULLFACE_BACK:
                        gl.enable(gl.CULL_FACE);
                        gl.cullFace(gl.BACK);
                        break;
                    case pc.gfx.CULLFACE_FRONTANDBACK:
                        gl.enable(gl.CULL_FACE);
                        gl.cullFace(gl.FRONT_AND_BACK);
                        break;
                }
                this.cullMode = cullMode;
            }
        },

        /**
         * @function
         * @name pc.gfx.Device#setIndexBuffer
         * @description Sets the current index buffer on the graphics device. On subsequent
         * calls to pc.gfx.Device#draw, the specified index buffer will be used to provide
         * index data for any indexed primitives.
         * @param {pc.gfx.IndexBuffer} indexBuffer The index buffer to assign to the device.
         */
        setIndexBuffer: function (indexBuffer) {
            // Store the index buffer
            if (this.indexBuffer !== indexBuffer) {
                this.indexBuffer = indexBuffer;

                // Set the active index buffer object
                var gl = this.gl;
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer ? indexBuffer.bufferId : null);
            }
        },

        /**
         * @function
         * @name pc.gfx.Device#setVertexBuffer
         * @description Sets the current vertex buffer for a specific stream index on the graphics
         * device. On subsequent calls to pc.gfx.Device#draw, the specified vertex buffer will be
         * used to provide vertex data for any primitives.
         * @param {pc.gfx.VertexBuffer} vertexBuffer The vertex buffer to assign to the device.
         * @param {Number} stream The stream index for the vertex buffer, indexed from 0 upwards.
         */
        setVertexBuffer: function (vertexBuffer, stream) {
            if (this.vertexBuffers[stream] !== vertexBuffer) {
                // Store the vertex buffer for this stream index
                this.vertexBuffers[stream] = vertexBuffer;

                // Push each vertex element in scope
                var vertexFormat = vertexBuffer.getFormat();
                var i = 0;
                var elements = vertexFormat.elements;
                var numElements = elements.length;
                while (i < numElements) {
                    var vertexElement = elements[i++];
                    vertexElement.stream = stream;
                    vertexElement.scopeId.setValue(vertexElement);
                }

                this.attributesInvalidated = true;
            }
        },

        /**
         * @function
         * @name pc.gfx.Device#setShader
         * @description Sets the active shader to be used during subsequent draw calls.
         * @param {pc.gfx.Shader} shader The shader to set to assign to the device.
         */
        setShader: function(shader) {
            if (shader !== this.shader) {
                this.shader = shader;

                // Set the active shader
                var gl = this.gl;
                gl.useProgram(shader.program);

                this.attributesInvalidated = true;
            }
        },

        /**

         * @function
         * @name pc.gfx.Device#getBoneLimit
         * @description Queries the maximum number of bones that can be referenced by a shader.
         * The shader generators (pc.gfx.programlib) use this number to specify the matrix array
         * size of the uniform 'matrix_pose[0]'. The value is calculated based on the number of
         * available uniform vectors available after subtracting the number taken by a typical
         * heavyweight shader. If a different number is required, it can be tuned via
         * pc.gfx.Device#setBoneLimit.
         * @returns {Number} The maximum number of bones that can be supported by the host hardware.
         */
        getBoneLimit: function () {
            return this.boneLimit;
        },

        /**
         * @function
         * @name pc.gfx.Device#setBoneLimit
         * @description Specifies the maximum number of bones that the device can support on
         * the current hardware. This function allows the default calculated value based on
         * available vector uniforms to be overridden.
         * @param {Number} maxBones The maximum number of bones supported by the host hardware.
         */
        setBoneLimit: function (maxBones) {
            this.boneLimit = maxBones;
        },

        /**
         * @function
         * @name pc.gfx.Device#enableValidation
         * @description Activates additional validation within the engine. Internally,
         * the WebGL error code is checked after every call to a WebGL function. If an error
         * is detected, it will be output to the Javascript console. Note that enabling
         * validation will have negative performance implications for the PlayCanvas runtime.
         * @param {Boolean} enable true to activate validation and false to deactivate it.
         */
        enableValidation: function (enable) {
            if (enable === true) {
                if (this.gl instanceof WebGLRenderingContext) {

                    // Create a new WebGLValidator object to
                    // usurp the real WebGL context
                    this.gl = new WebGLValidator(this.gl);
                }
            } else {
                if (this.gl instanceof WebGLValidator) {

                    // Unwrap the real WebGL context
                    this.gl = Context.gl;
                }
            }
        },

        /**
         * @function
         * @name pc.gfx.Device#validate
         * @description Performs a one time validation on the error state of the underlying
         * WebGL API. Note that pc.gfx.Device#enableValidation does not have to be activated
         * for this function to operate. If an error is detected, it is output to the
         * Javascript console and the function returns false. Otherwise, the function returns
         * true. If an error is detected, it will have been triggered by a WebGL call between
         * the previous and this call to pc.gfx.Device#validate. If this is the first call to
         * pc.gfx.Device#validate, it detects errors since the device was created.
         * @returns {Boolean} false if there was an error and true otherwise.
         */
        validate: function () {
            var gl = this.gl;
            var error = gl.getError();

            if (error !== gl.NO_ERROR) {
                Log.error("WebGL error: " + WebGLValidator.ErrorString[error]);
                return false;
            }

            return true;
        },

        /**
        * @function
        * @name pc.gfx.Device#resizeCanvas
        * @description Sets the width and height of the canvas, then fires the 'resizecanvas' event.
        */
        resizeCanvas: function (width, height) {
            this.canvas.width = width;
            this.canvas.height = height;

            this.fire(EVENT_RESIZE, width, height);
        }
    };

    Object.defineProperty(Device.prototype, 'maxSupportedMaxAnisotropy', {
        get: function() {
            return this.maxTextureMaxAnisotropy;
        }
    });

    Object.defineProperty(Device.prototype, 'width', {
        get: function() { return this.gl.drawingBufferWidth || this.canvas.width; }
    });

    Object.defineProperty(Device.prototype, 'height', {
        get: function() { return this.gl.drawingBufferHeight || this.canvas.height; }
    });

    Object.defineProperty(Device.prototype, 'fullscreen', {
        get: function() { return !!document.fullscreenElement; },
        set: function(fullscreen) {
            if (fullscreen) {
                var canvas = this.gl.canvas;
                canvas.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        }
    });

    return {
        UnsupportedBrowserError: UnsupportedBrowserError,
        ContextCreationError: ContextCreationError,
        Device: Device
    };
}());