var validator = require('is-my-json-valid');
var debug     = require('debug')('validate');

/** Return JSON schema construct for a constant */
var constant = function(value) {
  return {enum: [value]};
};

// Schema to validate against, note that we filter additionalProperties away
// during validation. So if a property is mentioned here it must satisfy the
// requirements here, or the proxy will return 403 forbidden. If not mentioned
// here the property will be filtered away and not included in the result.
var schema = {
  type:                   'object',
  properties: {
    // Properties always allowed regardless of their value
    Hostname:             {},
    Domainname:           {},
    User:                 {},
    Memory:               {},
    MemorySwap:           {},
    CpuShares:            {},
    Cpuset:               {},
    AttachStdin:          {},
    AttachStdout:         {},
    AttachStderr:         {},
    Tty:                  {},
    OpenStdin:            {},
    StdinOnce:            {},
    Env:                  {},
    Cmd:                  {},
    Entrypoint:           {},
    Image:                {},
    WorkingDir:           {},
    NetworkDisabled:      {},
    // Undocumented properties we always allow regardless of their value
    OnBuild:              {},

    // Properties we are a bit more careful about
    MacAddress:           constant(''),
    Volumes:              constant({}),     // TODO: Allow more here
    ExposedPorts:         constant({}),     // TODO: Allow more here
    SecurityOpts:         constant(null),
    HostConfig: {
      type:               'object',
      properties: {
        // Properties to be very careful with
        Binds:            constant(null),   // TODO: Allow more here
        Links:            {}, // Allow links to other containers
        LxcConf:          constant([]),
        PortBindings:     constant({}),
        PublishAllPorts:  constant(false),
        Privileged:       constant(false),
        ReadonlyRootfs:   {type: 'boolean'},
        Dns:              {}, // Allow DNS server modifications
        DnsSearch:        {}, // Allow DNS search domain modifications
        ExtraHosts:       {}, // Allow /etc/hosts modifications in container
        VolumesFrom:      {}, // Allow volumes from other containers
        CapAdd:           constant(null),
        CapDrop:          constant(null),
        RestartPolicy:    {}, // Allow any restart policies
        NetworkMode:      constant('bridge'),
        Devices:          constant([]),
        // Undocumented properties to be careful with
        ContainerIDFile:  constant(''),
        IpcMode:          constant(''),
        PidMode:          constant(''),
        SecurityOpt:      {enum: [null]}
      },
      // Notice that we apply a filter first, so additional properties are
      // filtered away, because we've set to false here.
      additionalProperties:   false
    },
  },
  // Notice that we apply a filter first, so additional properties are
  // filtered away, because we've set to false here.
  additionalProperties:   false
};

// Compile validator with is-my-json-valid
var filter    = validator.filter(schema);
var validate  = validator(schema, {
  verbose:    true,
  greedy:     true
});

/** Export validator that filters away additionalProperties */
module.exports = function(data) {
  // Filter unknown properties away when additionalProperties: false, this is a
  // is-my-json-valid implemenation specific feature.
  filter(data);

  // Validate that filter data satisfies the JSON schema
  // This step should be part of the filter() call, but isn't due to a bug:
  // https://github.com/mafintosh/is-my-json-valid/issues/44
  validate(data);

  // If errors we should log them to debug
  if (validate.errors) {
    debug("Validation failed, errors: %j", validate.errors);
  }

  // Return errors
  return validate.errors;
};
