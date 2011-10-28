pc.extend(pc.fw, function () {
    /**
     * @name pc.fw.LiveLinkOpenEntityMessage
     * @constructor Create a new LiveLinkOpenEntityMessage from individual attributes
     * @class Signal that an Entity should be loaded and opened
     * @param {Object} id
     * @param {Object} models List of all models, first should be parent, followed by all descendants
     * @private
     */
    var LiveLinkOpenEntityMessage = function(models) {
        this.type = pc.fw.LiveLinkMessageType.OPEN_ENTITY
        this.content = {
            models: models
        };
    };
    LiveLinkOpenEntityMessage = LiveLinkOpenEntityMessage.extendsFrom(pc.fw.LiveLinkMessage);
    pc.fw.LiveLinkMessage.register("OPEN_ENTITY");
        
    return {
        LiveLinkOpenEntityMessage: LiveLinkOpenEntityMessage
    };
}());