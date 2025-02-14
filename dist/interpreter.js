const aflatten = (ary) => ary.flat(Infinity);

class Deferred {
  promise = {}
  reject = {}
  resolve = {}          

  constructor() {
    this.promise = new Promise((resolve, reject)=> {
      this.reject = reject
      this.resolve = resolve
    });
  }
}  

function isNumeric(value) {
  return /^-?\d+$/.test(value);
}

const WLNumber = new RegExp(/^(-?\d+)(.?\d*)(\*\^)?(\d*)/);

window.Deferred = Deferred;
window.aflatten = aflatten;

window.isNumeric = isNumeric;

var interpretate = (d, env = {}) => {
  interpretate.cnt = interpretate.cnt + 1;          

  if (typeof d === 'undefined') {
    console.log('undefined object');
    return d;
  }

  const stringQ = typeof d === 'string';
  //console.log(d);
  //console.log(stringQ);
  //real string
  if (stringQ) {
    if (d.charAt(0) == "'") return d.slice(1, -1);
    if (isNumeric(d)) return parseInt(d); //for Integers
  
    if (WLNumber.test(d)) {
      console.log(d);
      //deconstruct the string
      let [begin, floatString, digits, man, power] = d.split(WLNumber);
    
      if (digits === '.')
        floatString += digits + '0';
      else
        floatString += digits;
    
      if (man)
        floatString += 'E' + power;

      console.log(floatString);
    
      return parseFloat(floatString);
    }

    //in safe mode just convert unknown symbols into a string
    //if (!env.unsafe) return d;
    //if not. it means this is a symbol
  }
  if (typeof d === 'number') {
    return d; 
  }

  //console.log('type '+String(typeof d)+' of '+JSON.stringify(d));

  //if not a JSON array, probably a promise object or a function
  if (!(d instanceof Array) && !stringQ) return d;


  //console.log(env);


  //reading the structure of Wolfram ExpressionJSON
  let name;
  let args;

  if (stringQ) {
    //symbol
    name = d;
    args = undefined;
  } else {
    //subvalue
    name = d[0];
    args = d.slice(1, d.length);
  }

  //console.log("interpreting...");
  //console.log(name);
  //console.log(name);

  //checking the scope
  if ('scope' in env) 
    if (name in env.scope) 
      return env.scope[name](args, env);



  //checking the context
  if ('context' in env) {
    if (name in env.context) {
      //checking the method


      if (env['method']) {
        if (!env.context[name][env.method]) return console.error('method '+env['method']+' is not defined for '+name);
        return env.context[name][env.method](args, env);
      }

      //fake frontendexecutable
      //to bring local vars and etc
      if ('virtual' in env.context[name] && !(env.novirtual)) {
        const obj = new ExecutableObject('virtual-'+uuidv4(), env, d);
        let virtualenv = obj.assignScope();
        console.log('virtual env');
        obj.firstName = name;
        //console.log(virtualenv);
        return env.context[name](args, virtualenv);    
      }

      return env.context[name](args, env);
    }
  }

  //just go over all contextes defined to find the symbol
  const c = interpretate.contextes;

  for (let i = 0; i < c.length; ++i) {
    if (name in c[i]) {
      //console.log('symbol '+name+' was found in '+c[i].name);

      if (env['method']) {
        if (!c[i][name][env.method]) return console.error('method '+env['method']+' is not defined for '+name);
        return c[i][name][env.method](args, env);
      }

      //fake frontendexecutable
      //to bring local vars and etc
      if ('virtual' in c[i][name] && !(env.novirtual)) {
        const obj = new ExecutableObject('virtual-'+uuidv4(), env, d);
        let virtualenv = obj.assignScope();
        console.log('virtual env');

        obj.firstName = name;
        //console.log(virtualenv);        
        return c[i][name](args, virtualenv);    
      }     

      return c[i][name](args, env);    
    }
  };

  return (interpretate.anonymous(d, env));          
};

interpretate.cnt = 0;

//contexes, so symbols names might be duplicated, therefore one can specify the propority context in env variable
interpretate.contextes = [];
//add new context
interpretate.contextExpand = (context) => {
  console.log(context.name + ' was added to the contextes of the interpreter');
  interpretate.contextes.push(context);
}

//packed symbols (for the case when Kernel is temporary unavailable)
interpretate.packedSymbols = {}
interpretate.usedPackedSymbols = {}

interpretate.garbageCollect = () => {
  //collected unused packedSymbols
  console.log('collect garbage!');
  Object.keys(interpretate.packedSymbols).forEach((s)=>{
    if (!(s in interpretate.usedPackedSymbols)) {
      //collect!
      console.warn('Symbol '+s+' was not used for a long time...');
      server.send('NotebookDisposeSymbol["'+s+'"]');
    } else {
      console.warn('Symbol '+s+' wont be disposed. 200');
    }
  });

}

interpretate.anonymous = async (d, org) => {
  //TODO Check if it set delayed or set... if set, then one need only to cache it
  console.warn('Anonimous symbol');  

  let name;
  if (d instanceof Array) {
    console.error('stack call: ');
    console.warn(org.global.stack);
    throw('subvalues are not supported for '+d[0]);
  } else {
    name = d;   //symbol
  }

  let data;
  let packed = false;

  if (!server.socket) {
    if (!(name in interpretate.packedSymbols)) {
      console.error('Symbol '+name+' is undefined in any contextes available. Communication with Wolfram Kernel is not possible for now.');
    } else {
      data = interpretate.packedSymbols[name];
      interpretate.usedPackedSymbols[name] = true;
      console.warn('packed Symbol: '+name);
      packed = true;
    }
  } else {
    if (name in interpretate.packedSymbols) {
      data = interpretate.packedSymbols[name];
      interpretate.usedPackedSymbols[name] = true;
      console.warn('packed Symbol: '+name);
      packed = true;
    } else {
      console.warn('sending request to a server... for'+name);
      data = await server.getSymbol(name); //get the data
      console.log('got');
      console.log(data);
    }
  }
  
  let symbolQ = typeof data === 'string';

  if (symbolQ) {
    if (data.charAt(0) == "'") symbolQ = false;
    if (isNumeric(data)) symbolQ = false;
  }

  if ((symbolQ && !(data in core)) || typeof data == 'undefined') {
    console.log('checking... '+name);
    console.log('gained data..'+data);
    if (!(name in interpretate.packedSymbols)) {
      throw('Symbol '+data+' is not defined in any contextes and packing'); 
      return;
    } else {
      packed = true;
      console.warn('packed Symbol: '+name);
      data = interpretate.packedSymbols[name];
      interpretate.usedPackedSymbols[name] = true;
    } 
  }

  core[name] = async (args, env) => {
    console.log('calling our symbol...');
    //evaluate in the context
    const data = await interpretate(core[name].data, env);

    if (env.root && !env.novirtual) core[name].instances[env.root.uid] = env.root; //if it was evaluated insdide the container, then, add it to the tracking list
    //if (env.hold) return ['JSObject', core[name].data];

    return data;
  }

  core[name].update = async (args, env) => {
    //evaluate in the context
 
    const data = await interpretate(core[name].data, env);
    //if (env.hold) return ['JSObject', data];
    return data;
  }  

  core[name].destroy = async (args, env) => {

    delete core[name].instances[env.root.uid];
    console.warn(env.root.uid + ' was destroyed')
    console.warn('external symbol was destoryed');
  }  

  core[name].data = data; //get the data

  if (!packed) server.addTracker(name);
  server.trackedSymbols[name] = true;

  core[name].virtual = true;
  core[name].instances = {};

  return interpretate(d, org);
}

//backward transformation
interpretate.toJSON = (d) => {
  if (typeof d === 'undefined') {
    console.log('undefined object');
    return 'Null';
  }
  if (typeof d === 'string') {
    return "'"+d+"'";
  }
  if (typeof d === 'number') {
    return d; 
  }

  //if not a JSON array, probably a promise object
  if (!(d instanceof Array)) {
    console.error('Unknow object. Replaced with Null');
    return 'Null';  
  }

  const sub = [];
  sub.push('List');
  sub.push(...d);

  return sub;

}

const fakeSocket = () => {
  return false;
}

fakeSocket.q = []

fakeSocket.send = (expr) => {
  console.warn('No connection to a kernel... keeping in a pocket');
  fakeSocket.q.push(expr)
}

//Server API
let server = {
  promises : {},
  socket: fakeSocket,  
  
  kernelControl: {
    
  },

  trackedSymbols: {},
  
  kernel: {
    socket: {
      send: () => {
        socket.send('NotebookPopupFire["error", "No connection to the working kernel. Please create a link first!"]');
        throw 'No connection to the working kernel. Please create a link first!';
      }
    }
  },

  init(socket) {
    if (this.socket.q) {
      console.warn('Sending all quered messages');
      this.socket.q.forEach((message)=>{
        socket.send(message);
      })
    }
    this.socket = socket;
  },

  //evaluate something on the master kernel and make a promise for the reply
  ask(expr) {
    const uid = uuidv4();

    const promise = new Deferred();
    this.promises[uid] = promise;

    this.socket.send('NotebookPromise["'+uid+'", ""]['+expr+']');

    return promise.promise 
  },
  //fire event on the secondary kernel (your working area) (no reply)
  emitt(uid, data) {
    this.kernel.socket.send('EmittedEvent["'+uid+'", '+data+']');
  },

  send(expr) {
    this.socket.send(expr);
  },

  post: {
    //for not it is raw association.
    //it can be packed as normal FILEFORM!
    emitt(uid, data) {
      const p = new Deferred();
      WSPHttpBigQuery('NotebookEmitt[EmittedEvent["'+uid+'", '+data+'], "'+window.Notebook+'"]', p);
      return p.promise;
    },

    send(data) {
      const p = new Deferred();
      WSPHttpBigQuery(data, p);
      return p.promise;      
    }
  },

  //evaluate something on the secondary kernel (your working area) and make a promise for the reply
  askKernel(expr) {
    const uid = uuidv4();

    const promise = new Deferred();
    this.promises[uid] = promise;
    //not implemented
    //console.error('askKernel is not implemented');
    //console.log('NotebookPromiseKernel["'+uid+'", ""][Hold['+expr+']]');
    this.socket.send('NotebookPromiseKernel["'+uid+'", ""][Hold['+expr+']]');

    return promise.promise    
  },

  getSymbol(expr) {
    const uid = uuidv4();

    const promise = new Deferred();
    this.promises[uid] = promise;
    //not implemented
    //console.error('askKernel is not implemented');
    //console.log('NotebookPromiseKernel["'+uid+'", ""][Hold['+expr+']]');
    this.socket.send('NotebookGetSymbol["'+uid+'", ""][Hold['+expr+']]');

    return promise.promise     
  },

  //evaluate something on the secondary kernel (your working area) (no reply)
  talkKernel(expr) {
    this.kernel.socket.send('NotebookEmitt['+expr+']');
  },

  clearObject(uid) {
    this.socket.send('NotebookGarbagePut["'+uid+'"];');
  },

  addTracker(name) {
    console.warn('added tracker for '+name);
    this.kernel.socket.send('NotebookAddTracking['+name+']')
  }
}


var ObjectHashMap = {}
var InstancesHashMap = {}

window.ObjectHashMap = ObjectHashMap
window.InstancesHashMap = InstancesHashMap

let garbageTimeout = false;

const renewGarbageTimer = () => {
  if (garbageTimeout) clearTimeout(garbageTimeout);
  garbageTimeout = setTimeout(collectGarbage, 10000);
}

const collectGarbage = () => {
  console.log('collecting garbage...');
  if (window.OfflineMode) return;
  Object.keys(ObjectHashMap).forEach((el)=>{
    ObjectHashMap[el].garbageCollect();
  });
}

//storage for the frontend objects / executables
class ObjectStorage {
  refs = {}
  uid = ''
  cached = false
  cache = []

  garbageCollect() {
    if (Object.keys(this.refs).length == 0) {
      server.clearObject(this.uid);
      this.cached = true;
      this.cache = ['GarbageCollected', 'Null'];
    }

  }         

  constructor(uid) {
    this.uid = uid;
    ObjectHashMap[uid] = this;

    //check garbage
    renewGarbageTimer();
  }           

  //assign an instance of FrontEndExecutable to it
  assign(obj) {
    this.refs[obj.instance] = obj;
  }         

  //remove a reference to the instance of FrontEndExecutable
  dropref(obj) {
    console.log('dropped ref: ' + obj.instance);
    delete this.refs[obj.instance];
  }         

  //update the data in the storage and go over all assigned objects
  update(newdata) {
    this.cache = newdata;
    Object.keys(this.refs).forEach((ref)=>{
      //console.log('Updating... ' + this.refs[ref].uid);
      this.refs[ref].update();
    });
  }         

  //just get the object (if not in the client -> ask for it and wait)
  get() {
    if (this.cached) return this.cache;
    const promise = new Deferred();
    console.log('NotebookGetObject["'+this.uid+'"]');
    server.ask('NotebookGetObject["'+this.uid+'"]').then((data)=>{
      this.cache = JSON.parse(interpretate(data));
      this.cached = true;
      console.log('got from the server. storing in cache...');
      promise.resolve(this.cache);
    })

    return promise.promise;  
  }
}

window.ObjectStorage = ObjectStorage

//instance of FrontEndExecutable object
class ExecutableObject {
  env = {}          

  //uid (not unique) (global)
  uid = ''
  //uid (unique) (internal)
  instance = ''         

  dead = false
  virtual = false

  //local scope
  local = {}

  assignScope() {
    this.env.local = this.local;
    return this.env;
  }

  //run the code inside
  async execute() {
    console.log('executing '+this.uid+'....');
    let content;

    if (this.virtual) console.error('execute() method is not allowed on virtual functions!');

    content = await this.storage.get(this.uid);

    //pass local scope
    this.env.local = this.local;
    //console.log('interpreting the content of '+this.uid+'....');
    //console.log('content');
    //console.log(content);
    return interpretate(content, this.env);
  }

  //dispose the object and all three of object underneath
  //direction: TOP -> BOTTOM
  dispose() {
    if (this.dead) return;
    this.dead = true;

    console.log('DESTORY: ' + this.uid);
    //change the mathod of interpreting
    this.env.method = 'destroy';

    if (this.virtual) console.log('virtual type was disposed'); else console.log('normal container was destoryed');

    //unregister from the storage class
    if (!this.virtual) this.storage.dropref(this);

    //no need of this since we can destory them unsing env.global.stack
    let content;
    if (!this.virtual) content = this.storage.get(this.uid); else content = this.virtual;

    //pass local scope
    this.env.local = this.local;    
    //the link between objects will be dead automatically
    interpretate(content, this.env);

    delete InstancesHashMap[this.instance];
  }         

  //update the state of it and recompute all objects inside
  //direction: BOTTOM -> TOP
  update(top) {
    //console.log('updating frontend object...'+this.uid);
    //bubble up (only by 1 level... cuz some BUG, but can still work even with this limitation)
    if (this.parent instanceof ExecutableObject && !(this.child instanceof ExecutableObject)) return this.parent.update(); 

    if (this.virtual) {
      //console.log('-> virtual type');
      //we can detect if it was destoryed
      //commit suicide because we alone ;(
      //this.destroy();
    }

    //change the method of interpreting 
    this.env.method = 'update';
    //pass local scope
    this.env.local = this.local;
    //console.log('interprete...'+this.uid);

    let content;
    if (!this.virtual) 
      content = this.storage.get(this.uid); else content = this.virtual;

    return this.local.middleware(interpretate(content, this.env));
  }

  constructor(uid, env, virtual = false) {
    console.log('constructing the instance of '+uid+'...');

    this.uid = uid;
    this.env = {...env};

    this.instance = uuidv4();

    this.env.element = this.env.element || 'body';
    //global scope
    //making a stack-call only for executable objects
    this.env.global.stack = this.env.global.stack || {};
    this.env.global.stack[uid] = this;

    this.env.root = this.env.root || {};

    //middleware handler (identity)
    this.local.middleware = (a) => a;

    //for virtual functions
    if (virtual) {
      console.log('virtual object detected!');
      console.log('local storage is enabled');
      //console.log(virtual);
      this.virtual = virtual;
    } else {
      if (uid in ObjectHashMap) this.storage = ObjectHashMap[uid]; else this.storage = new ObjectStorage(uid);
      this.storage.assign(this);
    }

    if (this.env.root instanceof ExecutableObject) {
      //connecting together
      console.log('connection between two: '+this.env.root.uid + ' and a link to '+this.uid);
      this.parent = this.env.root;
      this.env.root.child = this;
    }

    this.env.root = this;

    InstancesHashMap[this.instance] = this;

    //global hook-functions
    if (this.env.global.hooks) {
      const obj = this;
      this.env.global.hooks.forEach((hook) => {
        hook(obj)
      });
    }

    return this;
  }           
};

window.ExecutableObject = ExecutableObject


class jsRule {
  // Constructor
  constructor(left, right) {
    this.left = left;
    this.right = right;
  }
}



function uuidv4() { 
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

window.uuidv4 = uuidv4

function downloadByURL(url, name) {
  var link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', name);
  link.click();
  link.remove();
}

window.downloadByURL = downloadByURL

var setInnerHTML = function(elm, html) {
  elm.innerHTML = html;
  Array.from(elm.querySelectorAll("script")).forEach( oldScript => {
    const newScript = document.createElement("script");
    Array.from(oldScript.attributes)
      .forEach( attr => newScript.setAttribute(attr.name, attr.value) );
    newScript.appendChild(document.createTextNode(oldScript.innerHTML));
    oldScript.parentNode.replaceChild(newScript, oldScript);
  });         
};

window.setInnerHTML = setInnerHTML

function openawindow(url, target='_self') {
  const fake = document.createElement('a');
  fake.target = target;
  fake.href = url;
  fake.click();
}

window.openawindow = openawindow

interpretate.throttle = 30;

// Throttle function: Input as function which needs to be throttled and delay is the time interval in milliseconds
function throttle(cb, delay = () => interpretate.throttle) {
    let shouldWait = false
    let waitingArgs
    const timeoutFunc = () => {
      if (waitingArgs == null) {
        shouldWait = false
      } else {
        cb(...waitingArgs)
        waitingArgs = null
        setTimeout(timeoutFunc, delay())
      }
    }         

    return (...args) => {
      if (shouldWait) {
        waitingArgs = args
        return
      }         

      cb(...args)
      shouldWait = true
      setTimeout(timeoutFunc, delay())
    }
}

window.throttle = throttle;

window.server = server;

window.interpretate = interpretate;