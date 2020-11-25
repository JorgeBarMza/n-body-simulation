// *****************************************************************************
//  Globals 
// *****************************************************************************

// Imports
var $ = require('jquery')
var THREE = require('three')
var odex = require('odex');
const { data } = require('jquery');
const { Vector3 } = require('three');
var OrbitControls = require('three-orbit-controls')(THREE)

// Canvas globals
let renderer = null, 
scene = null, 
camera = null,
orbitControls = null,
ambientLight = null,

// Simulation globals
solution = [],
tLastUpdate = null,
iter = 0,
simulate = false,
deltaT = 0.03,
dims = 3, // x,y,z
eqs = 2, // acceleration and velocity. 
bodies = [],
arrowList = [];

// *****************************************************************************
//  Helpers
// *****************************************************************************

function getRandomColor() {
  var letters = '0123456789ABCDEF';
  var color = '#';
  for (var i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

// Returns an array of args for the setLength function of an ArrowHelper.
function arrowLength(v) {
  return [v.length()*4, v.length()*4/6, v.length()*4/12];
}

// Returns all body indices except a.
function otherBodies(toExclude) {
  result = [];
  bodies.forEach(body => {
    if (body != toExclude) {
      result.push(body);
    }
  });
  return result;
}

// Returns position vector of a body in a solution.
function getPosition(y, body) {
  return new Vector3(y[body.irx], y[body.iry], y[body.irz]);
}

// Returns velocity vector of a body in a solution.
function getVelocity(y, body) {
  return new Vector3(y[body.ivx], y[body.ivy], y[body.ivz]);
}

function startSimulation() {
  simulate = true;
}

class Body {
  constructor(mass, rx, ry, rz, vx, vy, vz) {
    this.color = getRandomColor();
    this.mass = mass;

    // Mesh.
    // TODO: make first arg proportional to mass.
    let geometry = new THREE.SphereGeometry(0.8, 20, 20);
    let material = new THREE.MeshPhongMaterial({color: getRandomColor()});
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(rx,ry,rz);
    
    // Velocity arrow.
    let velocity = new THREE.Vector3(vx,vy,vz);
    this.arrowV = new THREE.ArrowHelper(velocity.clone().normalize(), 
      THREE.Vector3(0,0,0), 3, 0xff0000);
    this.arrowV.setLength(...arrowLength(velocity));
    this.mesh.add(this.arrowV);
    this.velocity = velocity;
    arrowList.push(this.arrowV);

    // TODO: Acceleration arrow.

    // Solution offsets.
    //   [r1x, r1y, r1z, v1x, v2y, v3z
    //    ...,
    //    rNx, rNy, rNz, vNx, vNy, vNz]
    this.irx = eqs * dims * bodies.length + 0;
    this.iry = this.irx + 1;
    this.irz = this.irx + 2;
    this.ivx = this.irx + 3;
    this.ivy = this.irx + 4;
    this.ivz = this.irx + 5;
  }
}

// *****************************************************************************
// Math
// *****************************************************************************

// Returns v' solutions for a body affected by the gravitation of another.
function bodyAcc2(receiver, applier, y) {
  // Vector from receiver to applier.
  let rRecToApp = new Vector3().subVectors(getPosition(y,receiver),
                                   getPosition(y,applier));

  // Acceleration scalar.
  let G = 1  // 6.67408e-11 
  let K = 10  // Empirically tuned constant.
  let scalar = -1 * K * G * applier.mass / Math.pow(rRecToApp.length(), 3);

  return rRecToApp.multiplyScalar(scalar);
}

// Describes derivatives for a body the other bodies.
// Returns a 6 dimensional vector of velocity and acceleration values.
// Example: [r'x, r'y, r'z, v'x, v'y, v'z]
function bodyEqsN(receiver, appliers, y) {
  // Obtain acceleration (v')
  let netAcc = new THREE.Vector3(0,0,0);
  appliers.forEach(applier => {
    let acc = bodyAcc2(receiver, applier, y);
    netAcc.add(acc);
  });

  return [...getVelocity(y, receiver).toArray(), ...netAcc.toArray()];
}

// Describes the system of ODEs.
// Params -
// x: time (unused)
// y: position and velocity of all bodies.
let NBody = (x,y) => {
  let result = [];
  bodies.forEach(body => {
    result.push(...bodyEqsN(body, otherBodies(body), y));
  });
  return result;
};

// *****************************************************************************
// Simulation
// *****************************************************************************

$(document).ready(
	function() {
		let canvas = document.getElementById("webglcanvas");
		createScene(canvas);

		run();
	}
);

// Solves the system of ODEs and stores the result in the solution global var.
// Params -
//  y0: initial state of the system. It's structured like
//      [r1x, r1y, r1z, v1x, v2y, v3z
//       ...,
//       rNx, rNy, rNz, vNx, vNy, vNz]
//       where r is position, the number is the body index,
//         and (x,y,z) are standard basis vectors

function solve(y0) {
  let s = new odex.Solver(y0.length);
  s.denseOutput = true;
  timeEnd = 120; // seconds.
  sol = s.solve(NBody, 0, y0, timeEnd, 
    s.grid(deltaT, (x,y) => {
      let time = parseFloat(x).toPrecision(2);
      solution.push([time,y]);
  })).y
}

function run() {
  requestAnimationFrame(function() { run(); });

  renderer.render( scene, camera );
  orbitControls.update();

  // Update bodies.
  if (simulate && Date.now() - tLastUpdate > deltaT) {
    let y = solution[iter][1]; // index 0 is time, 1 is y values.
    bodies.forEach(body => {
      // Update position
      body.mesh.position.set(y[body.irx], y[body.iry], y[body.irz]);

      // Update velocity arrow.
      let v = getVelocity(y,body);
      body.arrowV.setDirection(v.clone().normalize());
      body.arrowV.setLength(...arrowLength(v));

      // TODO: update acceleration arrow.
    });
    ++iter;
    if (iter == solution.length) {
      simulate = false;
    }
    tLastUpdate = Date.now();
  } 
}

// Define and dipslay basic scene in the canvas.
function setupScene(canvas) {
  renderer = new THREE.WebGLRenderer( { canvas: canvas, antialias: true } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
    
  scene = new THREE.Scene();
  scene.background = new THREE.Color("rgb(0, 0, 0)");

  camera = new THREE.PerspectiveCamera( 45, canvas.width / canvas.height, 1, 4000 );
  camera.position.set(0, 5, 18);
  scene.add(camera);

  ambientLight = new THREE.AmbientLight ( 0x444444, 0.8);
  scene.add(ambientLight);

  let light = new THREE.DirectionalLight( new THREE.Color("rgb(200, 200, 200)"), 1);
  light.position.set(-2, -2, 2);
  light.target.position.set(0,0,0);
  scene.add(light);

  orbitControls = new OrbitControls(camera, renderer.domElement);
}

function createBodies() {
  // Define initial configuration. arXiv:math/0011268
  let r = [];
  r.push([-0.97000436, 0.24308753, 0]);
  r.push([0,0,0]);
  r.push([0.97000436, -0.24308753, 0]);
  r = r.map((e)=>e.map(i=>i*=10));

  let v = [];
  v.push([0.4662036850, 0.4323657300, 0]);      
  v.push([-0.93240737, -0.86473146, 0]);    
  v.push([0.4662036850, 0.4323657300, 0]);      

  // Create initial bodies.
  let b1 = new Body(1, ...r[0], ...v[0]);
  bodies.push(b1);
  scene.add(b1.mesh);

  let b2 = new Body(1, ...r[1], ...v[1]);
  bodies.push(b2);
  scene.add(b2.mesh);

  let b3 = new Body(1, ...r[2], ...v[2]);
  bodies.push(b3);
  scene.add(b3.mesh);

  // Serialize values.
  let y0 = [];
  bodies.forEach(body => {
    y0.push(...body.mesh.position.toArray());
    y0.push(...body.velocity.toArray());
  });
  return y0;
}

function createUI() {
  let simButton = document.getElementById("simulate");
  simButton.addEventListener("click", startSimulation);
  simButton.disabled = false;
   
  var getx = document.getElementById("x_input"), 
  gety = document.getElementById("y_input"), 
  getz = document.getElementById("z_input");

  // TODO: make the add and remove buttons work.
  /*
  let addBody = document.getElementById("addBody");
  addBody.addEventListener("click", ()=>{
    // get x, y, z values
    if(getx.value && gety.value && getz.value){
      console.log(getx.value, gety.value, getz.value);
      num_bodies++;  
      mesh1 = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({color:0xff0000}));

      // set position of new particle  
      let newGroupParticle = new THREE.Object3D;
      newGroupParticle.add(mesh1);
      group.add(newGroupParticle);
      bodies.push(newGroupParticle);
      newGroupParticle.position.set(getx.value, gety.value, getz.value); // warning!
      r.push([getx.value,gety.value,getz.value]);

      // set init velocity of new particle
      v.push([0.4662036850, 0.4323657300, 0]); //static

      // add to & update scene
      group.updateMatrixWorld();
    } else {
      alert("missing value!");
    } 
  });

  let removeBody = document.getElementById("removeBody");
  removeBody.addEventListener("click", ()=>{
    bodies.pop();
    // TODO: execute new simulation;
    simulate = false;
    // let y0 = ;
    group.updateMatrixWorld();
  });
  */

  // Update arrow display attribute.
  let checkVectors = document.querySelector("input[name=checkbox]");
  checkVectors.addEventListener("change", ()=>{
    var checked = $(checkVectors).prop('checked');
    if(checked===true){
      arrowList.forEach(e=>e.visible=true);
      scene.updateMatrixWorld();
    } else {
      arrowList.forEach(e=>e.visible=false);
      scene.updateMatrixWorld();
    }
  });
}

function createScene(canvas) {
    setupScene(canvas);
    let y0 = createBodies();
    solve(y0);
    createUI();
}


// Tasks:
// Badillo: Camera, post processing
// Guti: trail
// Jorge: Nbody add remove