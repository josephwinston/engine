pc.extend(pc, function () {
    /**
     * @name pc.AnimationComponentSystem
     * @constructor Create an AnimationComponentSystem
     * @class The AnimationComponentSystem is manages creating and deleting AnimationComponents
     * @param {pc.Application} app The Application for the current application
     * @extends pc.ComponentSystem
     */
    var AnimationComponentSystem = function AnimationComponentSystem (app) {
        this.id = 'animation';
        this.description = "Specifies the animation assets that can run on the model specified by the Entity's model Component.";

        app.systems.add(this.id, this);

        this.ComponentType = pc.AnimationComponent;
        this.DataType = pc.AnimationComponentData;

        this.schema = [{
            name: "enabled",
            displayName: "Enabled",
            description: "Enable or disable the component",
            type: "boolean",
            defaultValue: true
        },{
            name: "assets",
            displayName: "Asset",
            description: "Animation Asset",
            type: "asset",
            options: {
                max: 100,
                type: "animation"
            },
            defaultValue: []
        }, {
            name: "speed",
            displayName: "Speed Factor",
            description: "Scale the animation playback speed",
            type: "number",
            options: {
                step: 0.1
            },
            defaultValue: 1.0
        }, {
            name: "loop",
            displayName: "Loop",
            description: "Loop the animation back to the start on completion",
            type: "boolean",
            defaultValue: true
        }, {
            name: "activate",
            displayName: "Activate",
            description: "Play the configured animation on load",
            type: "boolean",
            defaultValue: true
        }, {
            name: "animations",
            exposed: false
        }, {
            name: "skeleton",
            exposed: false,
            readOnly: true
        }, {
            name: "model",
            exposed: false,
            readOnly: true
        }, {
            name: "prevAnim",
            exposed: false,
            readOnly: true
        }, {
            name: "currAnim",
            exposed: false,
            readOnly: true
        }, {
            name: "fromSkel",
            exposed: false,
            readOnly: true
        }, {
            name: "toSkel",
            exposed: false,
            readOnly: true
        }, {
            name: "blending",
            exposed: false,
            readOnly: true
        }, {
            name: "blendTime",
            exposed: false,
            readOnly: true
        }, {
            name: "blendTimeRemaining",
            exposed: false,
            readOnly: true
        }, {
            name: "playing",
            exposed: false,
            readOnly: true
        }];

        this.exposeProperties();

        this.on('remove', this.onRemove, this);
        this.on('update', this.onUpdate, this);

        pc.ComponentSystem.on('update', this.onUpdate, this);
    };
    AnimationComponentSystem = pc.inherits(AnimationComponentSystem, pc.ComponentSystem);

    pc.extend(AnimationComponentSystem.prototype, {
        initializeComponentData: function (component, data, properties) {
            properties = ['activate', 'loop', 'speed', 'assets', 'enabled'];
            AnimationComponentSystem._super.initializeComponentData.call(this, component, data, properties);
        },

        cloneComponent: function (entity, clone) {
            var component = this.addComponent(clone, {});

            clone.animation.data.assets = pc.extend([], entity.animation.assets);
            clone.animation.data.speed = entity.animation.speed;
            clone.animation.data.loop = entity.animation.loop;
            clone.animation.data.activate = entity.animation.activate;
            clone.animation.data.enabled = entity.animation.enabled;

            clone.animation.animations = pc.extend({}, entity.animation.animations);
        },

        onRemove: function (entity, data) {
            delete data.animation;
            delete data.skeleton;
            delete data.fromSkel;
            delete data.toSkel;
        },

        onUpdate: function (dt) {
            var components = this.store;

            for (var id in components) {
                if (components.hasOwnProperty(id)) {
                    var component = components[id];
                    var componentData = component.data;
                    if (componentData.enabled && componentData.playing && component.entity.enabled) {
                        var skeleton = componentData.skeleton;
                        if (skeleton !== null && componentData.model !== null) {
                            if (componentData.blending) {
                                componentData.blendTimeRemaining -= dt;
                                if (componentData.blendTimeRemaining < 0.0) {
                                    componentData.blendTimeRemaining = 0.0;
                                }
                                var alpha = 1.0 - (componentData.blendTimeRemaining / componentData.blendTime);
                                skeleton.blend(componentData.fromSkel, componentData.toSkel, alpha);
                            } else {
                                // Advance the animation, interpolating keyframes at each animated node in
                                // skeleton
                                var delta = dt * componentData.speed;
                                skeleton.addTime(delta);
                                if ((skeleton.getCurrentTime() === skeleton.getAnimation().getDuration()) && !componentData.loop) {
                                    componentData.playing = false;
                                }
                            }

                            if (componentData.blending && (componentData.blendTimeRemaining === 0.0)) {
                                componentData.blending = false;
                                skeleton.setAnimation(componentData.toSkel.getAnimation());
                            }

                            skeleton.updateGraph();
                        }
                    }
                }
            }
        }
    });

    return {
        AnimationComponentSystem: AnimationComponentSystem
    };
}());
