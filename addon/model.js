import DS               from 'ember-data';
import isOffline        from './is-offline';
import generateUniqueId from './generate-unique-id';
import Ember            from 'ember';

var Promise = Ember.RSVP.Promise;

export default DS.Model.extend({
  /**
   * This method has no params
   */
  save: function() {
    var record     = this;
    var _superSave = this.__nextSuper;
    var store      = this.get('store');

    return store.get('syncer').syncUp()
      .then(function() {
        return _superSave.call(record);
      })
      .then(saveLocal)
      .catch(useLocalIfOffline);

    function saveLocal(record) {
      var localAdapter = store.get('fryctoria.localAdapter');
      var trashStore   = store.get('fryctoria.trashStore');

      if(record.get('isDeleted')) {
        localAdapter.deleteRecord(trashStore, record.constructor, record);
      } else {
        localAdapter.createRecord(trashStore, record.constructor, record);
      }

      return record;
    }

    function useLocalIfOffline(error) {
      if(isOffline(error && error.status)) {
        store.set('fryctoria.isOffline', true);
        // make sure record has an id
        // https://github.com/emberjs/data/blob/1.0.0-beta.15/packages/ember-data/lib/system/store.js#L1289
        if(!record.get('id')) {
          record.get('store').updateId(record, {id: generateUniqueId()});
        }

        createJobInSyncer(store.get('syncer'), record);

        return _superSave.call(record);
      } else {
        return Promise.reject(error);
      }
    }
  }
});

function createJobInSyncer(syncer, record) {
  var typeName = record.constructor.typeKey;
  var operation;

  if(record.get('isNew')) {
    operation = 'create';
  } else if(record.get('isDeleted')) {
    operation = 'delete';
  } else {
    operation = 'update';
  }

  syncer.createJob(operation, typeName, record.serialize({includeId: true}));
}
