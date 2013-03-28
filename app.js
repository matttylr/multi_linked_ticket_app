(function() {
  function ChildTicketAttributes(app){
    this.requesterAttributes = function(){
      var type = app.form.requesterType();
      var attributes  = {};

      if (type == 'current_user'){
        attributes.requester_id = app.currentUser().id();
      } else if (type == 'ticket_requester' &&
                 app.ticket().requester().id()) {
        attributes.requester_id = app.ticket().requester().id();
      } else if (type == 'custom' &&
                 app.form.requesterEmail()){
        attributes.requester = {
          "email": app.form.requesterEmail(),
          "name": app.form.requesterName()
        };
      }

      return attributes;
    };

    this.assigneeAttributes = function(){
      var type = app.form.assigneeType();
      var attributes = {};

      // Very nice looking if/elseif/if/if/elseif/if/if
      // see: http://i.imgur.com/XA7BG5N.jpg
      if (type == 'current_user'){
        attributes.assignee_id = app.currentUser().id();
      } else if (type == 'ticket_assignee' &&
                 app.ticket().assignee()) {

        if (app.ticket().assignee().user()){
          attributes.assignee_id = app.ticket().assignee().user().id();
        }
        if (app.ticket().assignee().group()){
          attributes.group_id = app.ticket().assignee().group().id();
        }
      } else if (type == 'custom' &&
                 (app.form.group() || app.form.assignee())){
        var group_id = Number(app.form.group());
        var assignee_id = Number(app.form.assignee());

        if (_.isFinite(group_id))
          attributes.group_id = group_id;

        if (_.isFinite(assignee_id))
          attributes.assignee_id = assignee_id;
      }

      return attributes;
    };

    this.toJSON = function(){
      var params = {
        "subject": app.form.subject(),
        "description": app.form.description(),
        "custom_fields": [
          { id: app.ancestryFieldId(), value: 'child_of:' + app.ticket().id() }
        ]
      };

      _.extend(params,
               this.requesterAttributes(),
               this.assigneeAttributes()
              );

      if (!_.isEmpty(app.settings.child_tag))
        params.tags = [ app.settings.child_tag ];

      return { "ticket": params };
    };
  }

  function Form($el){
    this.$el = $el;

    this.subject = function(val){ return this._getOrSet('.subject', val); };
    this.description = function(val){return this._getOrSet('.description', val); };
    this.group = function(val){return this._getOrSet('.group', val); };
    this.assignee = function(val){return this._getOrSet('.assignee', val); };
    this.requesterEmail = function(val){return this._getOrSet('.requester_email', val); };
    this.requesterName = function(val){return this._getOrSet('.requester_name', val); };

    this.requesterType = function(){
      return this.$el.find('select[name=requester_type]').val();
    };

    this.assigneeType = function(){
      return this.$el.find('select[name=assignee_type]').val();
    };

    this.isValid = function(){
      return _.all(['.subject', '.description'], function(field) {
        return this.validateField(field);
      }, this);
    };

    this.validateField = function(field){
      var viewField = this.$el.find(field),
      valid = !_.isEmpty(viewField.val());

      if (valid){
        viewField.parents('.control-group').removeClass('error');
      } else {
        viewField.parents('.control-group').addClass('error');
      }

      return valid;
    };

    this.requesterFields = function(){
      return this.$el.find('.requester_fields');
    };

    this.assigneeFields = function(){
      return this.$el.find('.assignee_fields');
    };

    this.fillGroupWithCollection = function(collection){
      return this.$el.find('.group').html(this._htmlOptionsFor(collection));
    };

    this.fillAssigneeWithCollection = function(collection){
      return this.$el.find('.assignee').html(this._htmlOptionsFor(collection));
    };

    this.showAssignee = function(){
      return this.$el.find('.assignee-group').show();
    };

    this.hideAssignee = function(){
      return this.$el.find('.assignee-group').hide();
    };

    this.disableSubmit = function(){
      return this.$el.find('.btn').prop('disabled', true);
    };

    this.enableSubmit = function(){
      return this.$el.find('.btn').prop('disabled', false);
    };

    this._htmlOptionsFor =  function(collection){
      var options = '<option>-</option>';

      _.each(collection, function(item){
        options += '<option value="'+item.id+'">'+item.name+'</option>';
      });

      return options;
    };

    this._getOrSet = function(selector, val){
      if (_.isUndefined(val))
        return this.$el.find(selector).val();
      return this.$el.find(selector).val(val);
    };
  }

  function Spinner($el){
    this.$el = $el;

    this.spin = function(){
      this.$el.show();
    };

    this.unSpin = function(){
      this.$el.hide();
    };
  }

  return {
    appVersion: '1.5',
    childRegex: /child_of:(\d*)/,
    parentRegex: /(?:father_of|parent_of):(\d*)/, //father_of is here to ensure compatibility with older versions
    descriptionDelimiter: '\n--- Original Description --- \n',
    groups: [],

    events: {
      // APP EVENTS
      'app.activated'                   : 'onActivated',
      'ticket.status.changed'           : 'loadIfDataReady',
      // AJAX EVENTS
      'createChildTicket.done'          : 'createChildTicketDone',
      'fetchTicket.done'                : 'fetchTicketDone',
      'fetchGroups.done'                : function(data){ this.groups = data.groups; },

      'createChildTicket.fail'          : 'genericAjaxFailure',
      'updateCurrentTicket.fail'        : 'genericAjaxFailure',
      'fetchTicket.fail'                : 'genericAjaxFailure',
      'autocompleteRequester.fail'      : 'genericAjaxFailure',
      'fetchGroups.fail'                : 'genericAjaxFailure',
      'fetchUsersFromGroup.fail'        : 'genericAjaxFailure',
      // DOM EVENTS
      'click .new-linked-ticket'        : 'displayForm',
      'click .create-linked-ticket'     : 'create',
      'click .copy_description'         : 'copyDescription',
      'change select[name=requester_type]' : function(event){
        if (this.$(event.currentTarget).val() == 'custom')
          return this.form.requesterFields().show();
        return this.form.requesterFields().hide();
      },
      'change select[name=assignee_type]' : function(event){
        if (this.$(event.currentTarget).val() == 'custom')
          return this.form.assigneeFields().show();
        return this.form.assigneeFields().hide();
      },
      'change .group'                   : 'groupChanged'
    },

    requests: {
      createChildTicket: function(ticket){
        return {
          url: '/api/v2/tickets.json',
          dataType: 'json',
          data: JSON.stringify(ticket),
          processData: false,
          contentType: 'application/json',
          type: 'POST'
        };
      },
      updateCurrentTicket: function(data){
        return {
          url: '/api/v2/tickets/'+ this.ticket().id() +'.json',
          dataType: 'json',
          data: JSON.stringify(data),
          processData: false,
          contentType: 'application/json',
          type: 'PUT'
        };
      },
      fetchTicket: function(id){
        return {
          url: '/api/v2/tickets/' + id + '.json?include=groups,users',
          dataType: 'json',
          type: 'GET'
        };
      },
      autocompleteRequester: function(email){
        return {
          url: '/api/v2/users/autocomplete.json?name=' + email,
          type: 'POST'
        };
      },
      fetchGroups: function(){
        return {
          url: '/api/v2/groups/assignable.json',
          type: 'GET'
        };
      },
      fetchUsersFromGroup: function(group_id){
        return {
          url: '/api/v2/groups/' + group_id + '/users.json',
          type: 'GET'
        };
      }
    },

    onActivated: function(data) {
      this.doneLoading = false;

      if (!this.hideAncestryField())
        return this.doneLoading = true;

      this.loadIfDataReady();
    },

    loadIfDataReady: function(){
      if(!this.doneLoading &&
         this.ticket() &&
         this.ticket().id()){

        if (this.hasChild() || this.hasParent())
          return this.ajax('fetchTicket', this.childID() || this.parentID());

        this.ajax('fetchGroups');

        this.switchTo('home');

        this.doneLoading = true;
      }
    },

    displayForm: function(event){
      event.preventDefault();

      this.switchTo('form', {
        current_user: {
          email: this.currentUser().email()
        }
      });

      this.form = new Form(this.$('form.linked_ticket_form'));
      this.spinner = new Spinner(this.$('.spinner'));

      this.form.fillGroupWithCollection(this.groups);

      this.bindAutocompleteOnRequesterEmail();
    },

    create: function(event){
      event.preventDefault();

      var attributes = new ChildTicketAttributes(this).toJSON();

      if (this.form.isValid()){
        this.spinner.spin();
        this.form.disableSubmit();

        this.ajax('createChildTicket', attributes)
          .always(function(){
            this.spinner.unSpin();
            this.form.enableSubmit();
          });
      }
    },

    fetchTicketDone: function(data){
      var assignee = _.find(data.users, function(user){
        return user.id == data.ticket.assignee_id;
      });

      var custom_field = _.find(data.ticket.custom_fields, function(field){
        return field.id == this.ancestryFieldId();
      }, this);

      var is_child = this.childRegex.test(custom_field.value);

      var group = _.find(data.groups, function(item){
        return item.id == data.ticket.group_id;
      });

      if (assignee)
        assignee = assignee.name;

      this.switchTo('has_relation', { ticket: data.ticket,
                                      is_child: is_child,
                                      assignee: assignee,
                                      group: group
                                    });
    },

    createChildTicketDone: function(data){
      var value = "parent_of:" + data.ticket.id;

      this.ticket().customField("custom_field_" + this.ancestryFieldId(),
                                value
                               );

      this.ajax('updateCurrentTicket',
                { "ticket": { "custom_fields": [
                  { "id": this.ancestryFieldId(), "value": value }
                ]}});

      this.ajax('fetchTicket', data.ticket.id);

      this.spinner.unSpin();
    },

    copyDescription: function(){
      var description = this.form.description()
        .split(this.descriptionDelimiter);

      var ret = description[0];

      if (description.length === 1)
        ret += this.descriptionDelimiter + this.ticket().description();

      this.form.description(ret);
    },

    bindAutocompleteOnRequesterEmail: function(){
      var self = this;

      // bypass this.form to bind the autocomplete.
      this.$('.requester_email').autocomplete({
        minLength: 3,
        source: function(request, response) {
          self.ajax('autocompleteRequester', request.term).done(function(data){
            response(_.map(data.users, function(user){
              return {"label": user.email, "value": user.email};
            }));
          });
        }
      });
    },

    groupChanged: function(){
      var group_id = Number(this.form.group());

      if (!_.isFinite(group_id))
        return this.form.hideAssignee();

      this.spinner.spin();

      this.ajax('fetchUsersFromGroup', group_id)
        .done(function(data){
          this.form.showAssignee();
          this.form.fillAssigneeWithCollection(data.users);
        })
        .always(function(){ this.spinner.unSpin(); });
    },

    genericAjaxFailure: function(){
      services.notify(this.I18n.t('ajax_failure'), 'error');
    },
    hideAncestryField: function(){
      var field = this.ticketFields("custom_field_" + this.ancestryFieldId());

      if (!field){
        services.notify(this.I18n.t("ancestry_field_missing"), "error");
        return false;
      }

      return field.hide();
    },
    ancestryValue: function(){
      return this.ticket().customField("custom_field_" + this.ancestryFieldId());
    },
    ancestryFieldId: function(){
      return this.setting('ancestry_field');
    },
    hasChild: function(){
      return this.parentRegex.test(this.ancestryValue());
    },
    hasParent: function(){
      return this.childRegex.test(this.ancestryValue());
    },
    childID: function(){
      if (!this.hasChild())
        return;

      return this.parentRegex.exec(this.ancestryValue())[1];
    },
    parentID: function(){
      if (!this.hasParent())
        return;

      return this.childRegex.exec(this.ancestryValue())[1];
    }
  };
}());
