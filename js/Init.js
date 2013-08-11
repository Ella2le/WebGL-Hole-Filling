"use strict";


/**
 * Intializing the basic stuff.
 * @type {Object}
 */
var Init = {

	/**
	 * Intialize everything: Camera, scene, renderer …
	 */
	all: function() {
		var container = document.getElementById( "container" );

		UI.init();

		this.camera();
		SceneManager.init();
		this.lights();
		this.renderer( container );
		this.controls( container );

		animate();
		render();
	},


	/**
	 * Intialize the camera.
	 */
	camera: function() {
		var g = GLOBAL,
		    cc = CONFIG.CAMERA;

		g.CAMERA = new THREE.PerspectiveCamera(
			cc.ANGLE,
			window.innerWidth / window.innerHeight,
			cc.ZNEAR,
			cc.ZFAR
		);
		g.CAMERA.position.x = cc.POSITION.X;
		g.CAMERA.position.y = cc.POSITION.Y;
		g.CAMERA.position.z = cc.POSITION.Z;
	},


	/**
	 * Initialize the controls.
	 */
	controls: function( container ) {
		var g = GLOBAL,
		    cc = CONFIG.CONTROLS;

		g.CONTROLS = new THREE.TrackballControls( g.CAMERA, container );

		g.CONTROLS.rotateSpeed = cc.ROT_SPEED;
		g.CONTROLS.zoomSpeed = cc.ZOOM_SPEED;
		g.CONTROLS.panSpeed = cc.PAN_SPEED;
		g.CONTROLS.noZoom = false;
		g.CONTROLS.noPan = false;
		g.CONTROLS.staticMoving = true;
		g.CONTROLS.dynamicDampingFactor = 0.3;

		g.CONTROLS.addEventListener( "change", SceneManager.moveCameraLights, false );
		g.CONTROLS.addEventListener( "change", render, false );
	},


	/**
	 * Initialize lights. Scene has to be initialized first.
	 */
	lights: function() {
		var g = GLOBAL,
		    l = CONFIG.LIGHTS,
		    s = SceneManager.scene;
		var camPos = CONFIG.CAMERA.POSITION;
		var ambient, directional, lDir;

		// Lighting: Ambient
		for( var i = 0; i < l.AMBIENT.length; i++ ) {
			ambient = new THREE.AmbientLight( l.AMBIENT[i].color );

			g.LIGHTS.AMBIENT.push( ambient );
			s.add( ambient );
		}

		// Lighting: Directional
		for( var i = 0; i < l.DIRECTIONAL.length; i++ ) {
			lDir = l.DIRECTIONAL[i];
			directional = new THREE.DirectionalLight( lDir.color, lDir.intensity );
			directional.position.set( lDir.position[0], lDir.position[1], lDir.position[2] );

			g.LIGHTS.DIRECTIONAL.push( directional );
			s.add( directional );
		}

		// Lighting: Directional, moves with camera
		for( var i = 0; i < l.CAMERA.length; i++ ) {
			lDir = l.CAMERA[i];
			directional = new THREE.DirectionalLight( lDir.color, lDir.intensity );
			directional.position.set( camPos.X, camPos.Y, camPos.Z );

			g.LIGHTS.CAMERA.push( directional );
			s.add( directional );
		}
	},


	/**
	 * Initialize the renderer.
	 */
	renderer: function( container ) {
		var g = GLOBAL;

		g.RENDERER = new THREE.WebGLRenderer();
		g.RENDERER.setSize( window.innerWidth, window.innerHeight );

		container.appendChild( g.RENDERER.domElement );
	}

};
