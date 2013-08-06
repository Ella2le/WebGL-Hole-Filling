"use strict";


/**
 * Class for hole finding and filling algorithms.
 * @type {Object}
 */
var AdvancingFront = {

	HOLE_INDEX: -1,
	LAST_ITERATION: false, // for debugging

	HEAP_RULE_1: null,
	HEAP_RULE_2: null,
	HEAP_RULE_3: null,
	HEAP_RULE_R: null,


	/**
	 * Fill the hole using the advancing front algorithm.
	 * @param  {THREE.Mesh}        model The model to fill the holes in.
	 * @param  {Array<THREE.Line>} hole  The hole described by lines.
	 * @return {THREE.Geometry}          The generated filling.
	 */
	afmStart: function( model, hole ) {
		var filling = new THREE.Geometry(),
		    front = new THREE.Geometry();

		this.HOLE_INDEX = GLOBAL.HOLES.indexOf( hole );
		this.LAST_ITERATION = false;

		this.HEAP_RULE_1 = new Heap( "1" );
		this.HEAP_RULE_2 = new Heap( "2" );
		this.HEAP_RULE_3 = new Heap( "3" );
		this.HEAP_RULE_R = new Heap( "R" );

		front.vertices = hole.slice( 0 );
		filling.vertices = hole.slice( 0 );

		front.mergeVertices();
		filling.mergeVertices();

		var ca = this.computeAngles( front.vertices ),
		    count = 0,
		    stopIter = CONFIG.DEBUG.AFM_STOP_AFTER_ITER; // for debugging
		var angle, vNew;

		// Initialize heaps
		for( var i = 0; i < ca.angles.length; i++ ) {
			angle = ca.angles[i];

			if( angle.degree <= 75.0 ) {
				this.HEAP_RULE_1.insert( angle );
			}
			else if( angle.degree <= 135.0 ) {
				this.HEAP_RULE_2.insert( angle );
			}
			else if( angle.degree < 180.0 ) {
				this.HEAP_RULE_3.insert( angle );
			}
			else {
				this.HEAP_RULE_R.insert( angle );
			}
		}

		this.HEAP_RULE_1.sort();
		this.HEAP_RULE_2.sort();
		this.HEAP_RULE_3.sort();


		while( true ) {
			count++;

			// for debugging
			if( stopIter !== false && count > stopIter ) {
				break;
			}
			if( stopIter !== false && count == stopIter ) {
				this.LAST_ITERATION = true;
			}

			// Close last hole
			if( front.vertices.length == 4 ) {
				filling = this.closeHole4( front, filling );
				break;
			}
			else if( front.vertices.length == 3 ) {
				filling = this.closeHole3( front, filling );
				break;
			}
			else if( front.vertices.length == 1 ) {
				// TODO: REMOVE?
				GLOBAL.SCENE.add( Scene.createPoint( front.vertices[0], 0.04, 0x99CCFF, true ) );
				break;
			}

			// Rule 1
			if( this.HEAP_RULE_1.length() > 0 ) {
				vNew = this.applyRule1( front, filling );
			}
			// Rule 2
			else if( this.HEAP_RULE_2.length() > 0 ) {
				vNew = this.applyRule2( front, filling );
			}
			// Rule 3
			else if( this.HEAP_RULE_3.length() > 0 ) {
				vNew = this.applyRule3( front, filling );
			}
			else {
				this.showFilling( front, filling );
				throw new Error( "No rule could be applied. Stopping before entering endless loop." );
			}

			if( !vNew || front.vertices.length != 3 ) {
				// Compute the distances between each new created
				// vertex and see, if they can be merged.
				this.mergeByDistance( front, filling, vNew, hole );
			}
		}

		console.log(
			"Finished after " + ( count - 1 ) + " iterations.\n",
			"- New vertices: " + filling.vertices.length + "\n",
			"- New faces: " + filling.faces.length
		);

		if( this.HEAP_RULE_R.length() > 0 ) {
			console.warn( "Ignored " + this.HEAP_RULE_R.length() + " angles, because they were >= 180°." );
		}

		this.showFilling( front, filling );

		return filling;
	},


	/**
	 * Apply rule 1 of the advancing front mesh algorithm.
	 * Rule 1: Close gaps of angles <= 75°.
	 * @param {THREE.Geometry} front   The current border of the hole.
	 * @param {THREE.Geometry} filling The currently filled part of the original hole.
	 * @param {THREE.Vector3}  vp      Previous vector.
	 * @param {THREE.Vector3}  v       Current vector.
	 * @param {THREE.Vector3}  vn      Next vector.
	 */
	afRule1: function( front, filling, vp, v, vn ) {
		var vIndex = filling.vertices.indexOf( v ),
		    vnIndex = filling.vertices.indexOf( vn ),
		    vpIndex = filling.vertices.indexOf( vp );

		if( !this.isInHole( front, filling, vp, vn ) ) {
			return false;
		}

		filling.faces.push( new THREE.Face3( vIndex, vpIndex, vnIndex ) );

		// The vector v is not a part of the (moving) hole front anymore.
		front.vertices.splice( front.vertices.indexOf( v ), 1 );

		return true;
	},


	/**
	 * Apply rule 2 of the advancing front mesh algorithm.
	 * Rule 2: Create one new vertex if the angle is > 75° and <= 135°.
	 * @param {THREE.Geometry} front   The current border of the hole.
	 * @param {THREE.Geometry} filling The currently filled part of the original hole.
	 * @param {THREE.Vector3}  vp      Previous vector.
	 * @param {THREE.Vector3}  v       Current vector.
	 * @param {THREE.Vector3}  vn      Next vector.
	 */
	afRule2: function( front, filling, vp, v, vn ) {
		// To make things easier, we just move the whole thing into the origin
		// and when we have the new point, we move it back.
		var vpClone = vp.clone().sub( v ),
		    vnClone = vn.clone().sub( v ),
		    origin = new THREE.Vector3();

		// Create the plane of the vectors vp and vn
		// with position vector v.
		var plane = new Plane( origin, vpClone, vnClone );
		var adjusted, avLen, vNew;

		// Get a vector on that plane, that lies on half the angle between vp and vn.
		vNew = plane.getPoint( 1, 1 );

		// Compute the average length of vp and vn.
		// Then adjust the position of the new vector, so it has this average length.
		avLen = Utils.getAverageLength( vpClone, vnClone );
		vNew.setLength( avLen );
		vNew.add( v );


		if( !this.isInHole( front, filling, vNew, vp, vn ) ) {
			return false;
		}


		// New vertex
		filling.vertices.push( vNew );

		// New faces for 2 new triangles
		var len = filling.vertices.length;
		var vpIndex = filling.vertices.indexOf( vp ),
		    vIndex = filling.vertices.indexOf( v ),
		    vnIndex = filling.vertices.indexOf( vn );

		filling.faces.push( new THREE.Face3( vIndex, vpIndex, len - 1 ) );
		filling.faces.push( new THREE.Face3( vIndex, len - 1, vnIndex ) );


		// Update front
		var ix = front.vertices.indexOf( v );
		front.vertices[ix] = vNew;

		return vNew;
	},


	/**
	 * Apply rule 3 of the advancing front mesh algorithm.
	 * Rule 3: Create two new vertices if the angle is > 135°.
	 * @param {THREE.Geometry} front   The current border of the hole.
	 * @param {THREE.Geometry} filling The currently filled part of the original hole.
	 * @param {THREE.Vector3}  vp      Previous vector.
	 * @param {THREE.Vector3}  v       Current vector.
	 * @param {THREE.Vector3}  vn      Next vector.
	 * @param {float}          angle   Angle created by these vectors.
	 */
	afRule3: function( front, filling, vp, v, vn, angle ) {
		var vpClone = vp.clone().sub( v ),
		    vnClone = vn.clone().sub( v );

		// New vertice
		var halfWay = vnClone.clone().divideScalar( 2 );

		var cross1 = new THREE.Vector3().crossVectors( vpClone, vnClone );
		cross1.normalize();
		cross1.add( halfWay );
		cross1.add( v );

		var cross2 = new THREE.Vector3().crossVectors(
			cross1.clone().sub( v ).sub( halfWay ),
			vnClone.clone().sub( halfWay )
		);
		if( angle < 180.0 ) {
			cross2.multiplyScalar( -1 );
		}
		cross2.normalize();
		cross2.add( v ).add( halfWay );

		var plane = new Plane(
			new THREE.Vector3(),
			vnClone.clone().sub( halfWay ),
			cross2.clone().sub( v ).sub( halfWay )
		);
		var vNew = plane.getPoint( 0, vnClone.length() );

		vNew.add( v ).add( halfWay );
		vNew = this.keepNearPlane( v, vn, vNew );

		if( !this.isInHole( front, filling, vNew, vp, vn ) ) {
			return false;
		}


		// New vertex
		filling.vertices.push( vNew );

		// New face for the new triangle
		var len = filling.vertices.length;
		var vnIndex = filling.vertices.indexOf( vn ),
		    vIndex = filling.vertices.indexOf( v );

		filling.faces.push( new THREE.Face3( vnIndex, vIndex, len - 1 ) );

		// Update front
		var ix = front.vertices.indexOf( v );
		front.vertices.splice( ix + 1, 0, vNew );

		return vNew;
	},


	/**
	 * Apply AF rule 1 and organise heaps/angles.
	 * @param  {THREE.Geometry} front   Current front of hole.
	 * @param  {THREE.Geometry} filling Current filling of hole.
	 * @return {boolean}                Rule 1 doesn't create a new vertex, so it will always return false.
	 */
	applyRule1: function( front, filling ) {
		var angle = this.HEAP_RULE_1.removeFirst();

		var vNew = this.afRule1(
			front, filling,
			angle.vertices[0], angle.vertices[1], angle.vertices[2]
		);

		if( vNew ) {
			this.heapRemove( angle.previous );
			angle.previous.setVertices( [
				angle.previous.vertices[0],
				angle.previous.vertices[1],
				angle.vertices[2]
			] );
			angle.previous.next = angle.next;
			this.heapInsert( angle.previous );

			this.heapRemove( angle.next );
			angle.next.setVertices( [
				angle.vertices[0],
				angle.next.vertices[1],
				angle.next.vertices[2]
			] );
			angle.next.previous = angle.previous;
			this.heapInsert( angle.next );
		}
		// It failed, so insert the Angle back in.
		else {
			this.HEAP_RULE_1.insert( angle );
		}

		return false;
	},


	/**
	 * Apply AF rule 2 and organise heaps/angles.
	 * @param  {THREE.Geometry} front   Current front of hole.
	 * @param  {THREE.Geometry} filling Current filling of hole.
	 * @return {THREE.Vector3}          New vertex.
	 */
	applyRule2: function( front, filling ) {
		var angle = this.HEAP_RULE_2.removeFirst();

		var vNew = this.afRule2(
			front, filling,
			angle.vertices[0], angle.vertices[1], angle.vertices[2]
		);

		if( vNew ) {
			angle.setVertices( [
				angle.vertices[0],
				vNew,
				angle.vertices[2]
			] );
			this.heapInsert( angle );

			this.heapRemove( angle.previous );
			angle.previous.setVertices( [
				angle.previous.vertices[0],
				angle.previous.vertices[1],
				vNew
			] );
			this.heapInsert( angle.previous );

			this.heapRemove( angle.next );
			angle.next.setVertices( [
				vNew,
				angle.next.vertices[1],
				angle.next.vertices[2]
			] );
			this.heapInsert( angle.next );
		}
		else {
			this.HEAP_RULE_2.insert( angle );
		}

		return vNew;
	},


	/**
	 * Apply AF rule 3 and organise heaps/angles.
	 * @param  {THREE.Geometry} front   Current front of hole.
	 * @param  {THREE.Geometry} filling Current filling of hole.
	 * @return {THREE.Vector3}          New vertex.
	 */
	applyRule3: function( front, filling ) {
		var angle = this.HEAP_RULE_3.removeFirst();

		var vNew = this.afRule3(
			front, filling,
			angle.vertices[0], angle.vertices[1], angle.vertices[2],
			angle.degree
		);

		if( vNew ) {
			var newAngle = new Angle( [
				angle.vertices[1],
				vNew,
				angle.vertices[2]
			] );
			newAngle.previous = angle;
			newAngle.next = angle.next;
			this.heapInsert( newAngle );

			this.heapRemove( angle.next );
			angle.next.setVertices( [
				vNew,
				angle.next.vertices[1],
				angle.next.vertices[2]
			] );
			angle.next.previous = newAngle;
			this.heapInsert( angle.next );

			angle.setVertices( [
				angle.vertices[0],
				angle.vertices[1],
				vNew
			] );
			angle.next = newAngle;
			this.heapInsert( angle );
		}
		else {
			this.HEAP_RULE_3.insert( angle );
		}

		return vNew;
	},


	/**
	 * Close the last hole of only 3 vertices.
	 * @param  {THREE.Geometry} front   Current hole front.
	 * @param  {THREE.Geometry} filling Current hole filling.
	 * @return {THREE.Geometry}         Completed hole filling.
	 */
	closeHole3: function( front, filling ) {
		filling.faces.push( new THREE.Face3(
			filling.vertices.indexOf( front.vertices[1] ),
			filling.vertices.indexOf( front.vertices[0] ),
			filling.vertices.indexOf( front.vertices[2] )
		) );

		return filling;
	},


	/**
	 * Close the last hole of only 4 vertices.
	 * @param  {THREE.Geometry} front   Current hole front.
	 * @param  {THREE.Geometry} filling Current hole filling.
	 * @return {THREE.Geometry}         Completed hole filling.
	 */
	closeHole4: function( front, filling ) {
		filling.faces.push( new THREE.Face3(
			filling.vertices.indexOf( front.vertices[3] ),
			filling.vertices.indexOf( front.vertices[2] ),
			filling.vertices.indexOf( front.vertices[0] )
		) );
		filling.faces.push( new THREE.Face3(
			filling.vertices.indexOf( front.vertices[1] ),
			filling.vertices.indexOf( front.vertices[0] ),
			filling.vertices.indexOf( front.vertices[2] )
		) );

		return filling;
	},


	/**
	 * Compute the angles of neighbouring vertices.
	 * Angles are in degree.
	 * @param  {THREE.Geometry} front The model with the vertices.
	 * @return {Object}               The angles and the smallest one together with the index of the vertex.
	 */
	computeAngles: function( front ) {
		var angles = [],
		    smallest = {
				angle: 361.0,
				index: -1
		    };
		var angle, prev, v, vn, vp;

		for( var i = 0, len = front.length; i < len; i++ ) {
			vp = front[( i == 0 ) ? len - 1 : i - 1];
			v = front[i];
			vn = front[( i + 1 ) % len];

			prev = ( i == 0 ) ? null : angles[angles.length - 1];
			angle = new Angle( [vp, v, vn] );
			angle.previous = prev;

			angles.push( angle );

			if( i > 0 ) {
				angles[angles.length - 2].next = angles[angles.length - 1];
			}

			if( smallest.angle > angle.degree ) {
				smallest.angle = angle.degree;
				smallest.index = i;
			}
		}

		angles[0].previous = angles[angles.length - 1];
		angles[angles.length - 1].next = angles[0];

		return {
			angles: angles,
			smallest: smallest
		};
	},


	/**
	 * Insert an angle into the corresponding heap.
	 * @param {Angle} angle The angle to insert.
	 */
	heapInsert: function( angle ) {
		if( angle.degree <= 75.0 ) {
			this.HEAP_RULE_1.insert( angle );
		}
		else if( angle.degree <= 135.0 ) {
			this.HEAP_RULE_2.insert( angle );
		}
		else if( angle.degree < 180.0 ) {
			this.HEAP_RULE_3.insert( angle );
		}
		else {
			this.HEAP_RULE_R.insert( angle );
		}
	},


	/**
	 * Remove an angle from its heap(s).
	 * @param {Angle} angle The angle to remove.
	 */
	heapRemove: function( angle ) {
		// Rule 1
		if( angle.degree <= 75.0 ) {
			this.HEAP_RULE_1.remove( angle );
		}
		// Rule 2
		else if( angle.degree <= 135.0 ) {
			this.HEAP_RULE_2.remove( angle );
		}
		// Rule 3
		else if( angle.degree < 180.0 ) {
			this.HEAP_RULE_3.remove( angle );
		}
		else {
			this.HEAP_RULE_R.remove( angle );
		}
	},


	/**
	 * Angle heaps have to be updated if vertices of the front are being merged.
	 * @param  {THREE.Vector3} vOld The old vertex.
	 * @param  {THREE.Vector3} vNew The new vertex.
	 * @return {boolean}            True, if an angle has been updated, false otherwise.
	 */
	heapMergeVertex: function( vOld, vNew ) {
		var search = [
			this.HEAP_RULE_1,
			this.HEAP_RULE_2,
			this.HEAP_RULE_3,
			this.HEAP_RULE_R
		];
		var angle, angles, heap;

		for( var i = 0; i < search.length; i++ ) {
			heap = search[i];

			for( var key in heap.values ) {
				angles = heap.values[key];

				for( var j = 0; j < angles.length; j++ ) {
					angle = angles[j];

					// Match with vOld in the "middle"
					if( angle.vertices[1] == vOld ) {
						if( angle.previous.vertices[1] == vNew ) {
							angle.previous.vertices[2] = angle.vertices[2];
							angle.next.vertices[0] = vNew;
						}
						else if( angle.next.vertices[1] == vNew ) {
							angle.previous.vertices[2] = vNew;
							angle.next.vertices[0] = angle.vertices[0];
						}
						else {
							throw new Error(
								"Situation that shouldn't be possible. "
								+ "Neither previous nor next angle contain the new vertex."
							);
						}

						angle.previous.next = angle.next;
						angle.next.previous = angle.previous;

						this.heapRemove( angle.previous );
						angle.previous.calculateAngle();
						this.heapInsert( angle.previous );

						this.heapRemove( angle.next );
						angle.next.calculateAngle();
						this.heapInsert( angle.next );

						heap.remove( angle );

						return true;
					}
				}
			}
		}

		return false;
	},


	/**
	 * Check, if a vector is inside the hole or has left the boundary.
	 * @param  {Array}         front The current front of the hole.
	 * @param  {THREE.Vector3} v     The vector to check.
	 * @param  {THREE.Vector3} fromA
	 * @param  {THREE.Vector3} fromB
	 * @return {boolean}             True, if still inside, false otherwise.
	 */
	isInHole: function( front, filling, v, fromA, fromB ) {
		var modelGeo = GLOBAL.MODEL.geometry;
		var a, b, c, face;

		for( var i = 0; i < filling.faces.length; i++ ) {
			face = filling.faces[i];

			a = filling.vertices[face.a];
			b = filling.vertices[face.b];
			c = filling.vertices[face.c];

			if( a.equals( fromA ) || b.equals( fromA ) || c.equals( fromA ) ) {
				continue;
			}
			if( typeof fromB != "undefined" && fromB != null ) {
				if( a.equals( fromB ) || b.equals( fromB ) || c.equals( fromB ) ) {
					continue;
				}
			}
			else if( a.equals( v ) || b.equals( v ) || c.equals( v ) ) {
				continue;
			}

			if( Utils.checkIntersectionOfTriangles3D( a, b, c, v, fromA, fromB ) ) {
				// GLOBAL.SCENE.add( Scene.createPoint( a, 0.04, 0xFFEE00, true ) );
				// GLOBAL.SCENE.add( Scene.createPoint( b, 0.04, 0xFFEE00, true ) );
				// GLOBAL.SCENE.add( Scene.createPoint( c, 0.04, 0xFFEE00, true ) );

				// GLOBAL.SCENE.add( Scene.createLine( a, b, 1, 0xFFEE00, true ) );
				// GLOBAL.SCENE.add( Scene.createLine( b, c, 1, 0xFFEE00, true ) );
				// GLOBAL.SCENE.add( Scene.createLine( c, a, 1, 0xFFEE00, true ) );

				// GLOBAL.SCENE.add( Scene.createPoint( fromA, 0.04, 0xFF0000, true ) );
				// if( fromB ) {
				// 	GLOBAL.SCENE.add( Scene.createPoint( fromB, 0.04, 0xFF0000, true ) );
				// 	GLOBAL.SCENE.add( Scene.createLine( fromB, v, 1, 0xFF0000, true ) );
				// }
				// GLOBAL.SCENE.add( Scene.createPoint( v, 0.04, 0xFF0000, true ) );
				// GLOBAL.SCENE.add( Scene.createLine( fromA, v, 1, 0xFF0000, true ) );

				return false;
			}
		}

		if( CONFIG.HF.FILLING.COLLISION_TEST == "all" ) {
			for( var i = 0; i < modelGeo.faces.length; i++ ) {
				face = modelGeo.faces[i];

				a = modelGeo.vertices[face.a];
				b = modelGeo.vertices[face.b];
				c = modelGeo.vertices[face.c];

				if( a.equals( fromA ) || b.equals( fromA ) || c.equals( fromA ) ) {
					continue;
				}
				if( typeof fromB != "undefined" && fromB != null ) {
					if( a.equals( fromB ) || b.equals( fromB ) || c.equals( fromB ) ) {
						continue;
					}
				}

				if( Utils.checkIntersectionOfTriangles3D( a, b, c, fromA, fromB, v ) ) {
					// GLOBAL.SCENE.add( Scene.createPoint( a, 0.04, 0xFFEE00, true ) );
					// GLOBAL.SCENE.add( Scene.createPoint( b, 0.04, 0xFFEE00, true ) );
					// GLOBAL.SCENE.add( Scene.createPoint( c, 0.04, 0xFFEE00, true ) );

					// GLOBAL.SCENE.add( Scene.createLine( a, b, 1, 0xFFEE00, true ) );
					// GLOBAL.SCENE.add( Scene.createLine( b, c, 1, 0xFFEE00, true ) );
					// GLOBAL.SCENE.add( Scene.createLine( c, a, 1, 0xFFEE00, true ) );

					// GLOBAL.SCENE.add( Scene.createPoint( fromA, 0.04, 0xFF0000, true ) );
					// if( fromB ) {
					// 	GLOBAL.SCENE.add( Scene.createPoint( fromB, 0.04, 0xFF0000, true ) );
					// 	GLOBAL.SCENE.add( Scene.createLine( fromB, v, 1, 0xFF0000, true ) );
					// }
					// GLOBAL.SCENE.add( Scene.createPoint( v, 0.04, 0xFF0000, true ) );
					// GLOBAL.SCENE.add( Scene.createLine( fromA, v, 1, 0xFF0000, true ) );

					return false;
				}
			}
		}

		return true;
	},


	/**
	 * Keep a vector close to the plane of its creating vectors.
	 * Calculates the standard variance of the X, Y, and Z coordinates
	 * and adjusts the coordinate of the new vector to the smallest one.
	 * @param  {THREE.Vector3} v    One of the creating vectors.
	 * @param  {THREE.Vector3} vn   One of the creating vectors.
	 * @param  {THREE.Vector3} vNew The newly created vector.
	 * @return {THREE.Vector3}      Adjusted vector.
	 */
	keepNearPlane: function( v, vn, vNew ) {
		var variance = Utils.calculateVariances( [v, vn] );

		if( variance.x < variance.y ) {
			if( variance.x < variance.z ) {
				vNew.x = variance.average.x;
			}
			else {
				vNew.z = variance.average.z;
			}
		}
		else {
			if( variance.y < variance.z ) {
				vNew.y = variance.average.y;
			}
			else {
				vNew.z = variance.average.z;
			}
		}

		return vNew;
	},


	/**
	 * Merge vertices that are close together.
	 * @param {THREE.Geometry}       front   The current hole front.
	 * @param {THREE.Geometry}       filling The current hole filling.
	 * @param {THREE.Vector3}        v       The new vertex, otheres may be merged into.
	 * @param {Array<THREE.Vector3>} ignore  Vertices to ignore, that won't be merged.
	 */
	mergeByDistance: function( front, filling, v, ignore ) {
		var vIndex = filling.vertices.indexOf( v ),
		    vIndexFront = front.vertices.indexOf( v );
		var t, tIndex;

		// No new vertex has been added, but
		// there may be some duplicate ones
		if( !v ) {
			return true;
		}

		if( vIndex < 0 ) {
			console.error( "mergeByDistance: Given vertex not part of filling!" );
			return false;
		}

		var vIndexBefore = vIndexFront - 1,
		    vIndexAfter = vIndexFront + 1;

		if( vIndexBefore < 0 ) {
			vIndexBefore = front.vertices.length - 1;
		}
		if( vIndexAfter > front.vertices.length - 1 ) {
			vIndexAfter = 0;
		}

		var compare = [
			front.vertices[vIndexBefore],
			front.vertices[vIndexAfter]
		];

		// Compare the new point to its direct neighbours
		for( var i = 0; i < compare.length; i++ ) {
			t = compare[i];

			// The original form of the hole shall not be changed
			if( ignore.indexOf( t ) >= 0 ) {
				continue;
			}

			// Merge points if distance below threshold
			if( v.distanceTo( t ) <= CONFIG.HF.FILLING.THRESHOLD_MERGE ) {
				if( CONFIG.DEBUG.SHOW_MERGING ) {
					GLOBAL.SCENE.add( Scene.createPoint( t, 0.02, 0xFFEE00, true ) );
					GLOBAL.SCENE.add( Scene.createPoint( v, 0.012, 0xFFEE00, true ) );
					GLOBAL.SCENE.add( Scene.createLine( t, v, 1, 0xFFEE00, true ) );
				}

				tIndex = filling.vertices.indexOf( t );
				vIndex = filling.vertices.indexOf( v );
				filling.vertices.splice( tIndex, 1 );

				this.updateFaces( filling, tIndex, vIndex );
				this.mergeUpdateFront( front, t, v );
				this.heapMergeVertex( t, v );
			}
		}
	},


	/**
	 * Update the front according to the merged points.
	 * @param {THREE.Geometry} front The current hole front.
	 * @param {THREE.Vector3}  vOld  The new vertex.
	 * @param {THREE.Vector3}  vNew  The merged-away vertex.
	 */
	mergeUpdateFront: function( front, vOld, vNew ) {
		var ixFrom = front.vertices.indexOf( vOld ),
		    ixTo = front.vertices.indexOf( vNew );

		if( ixFrom < 0 || ixTo < 0 ) {
			throw new Error( "Vertex not found in front." );
		}

		front.vertices.splice( ixFrom, 1 );
	},


	/**
	 * Render the finished hole filling.
	 * Create a mesh from the computed data and render it.
	 * @param {THREE.Geometry} front   Front of the hole.
	 * @param {THREE.Geometry} filling Filling of the hole.
	 */
	showFilling: function( front, filling ) {
		var g = GLOBAL,
		    model = g.MODEL;

		if( !g.FILLINGS.hasOwnProperty( this.HOLE_INDEX ) ) {
			g.FILLINGS[this.HOLE_INDEX] = {
				solid: false,
				wireframe: false
			};
		}

		// Filling as solid form
		if( CONFIG.HF.FILLING.SHOW_SOLID ) {
			if( g.FILLINGS[this.HOLE_INDEX].solid ) {
				g.SCENE.remove( g.FILLINGS[this.HOLE_INDEX].solid );
			}

			var materialSolid = new THREE.MeshPhongMaterial( {
				color: CONFIG.HF.FILLING.COLOR,
				shading: Scene.getCurrentShading(),
				side: THREE.DoubleSide,
				wireframe: false
			} );
			var meshSolid = new THREE.Mesh( filling, materialSolid );

			meshSolid.position.x += model.position.x;
			meshSolid.position.y += model.position.y;
			meshSolid.position.z += model.position.z;

			meshSolid.geometry.computeFaceNormals();
			meshSolid.geometry.computeVertexNormals();
			meshSolid.geometry.computeBoundingBox();

			g.FILLINGS[this.HOLE_INDEX].solid = meshSolid;
			GLOBAL.SCENE.add( meshSolid );
		}

		// Filling as wireframe
		if( CONFIG.HF.FILLING.SHOW_WIREFRAME ) {
			var materialWire = new THREE.MeshBasicMaterial( {
				color: 0xFFFFFF,
				overdraw: true, // Doesn't seem to work
				side: THREE.DoubleSide,
				wireframe: true,
				wireframeLinewidth: CONFIG.HF.FILLING.LINE_WIDTH
			} );
			var meshWire = new THREE.Mesh( filling, materialWire );

			meshWire.position.x += model.position.x;
			meshWire.position.y += model.position.y;
			meshWire.position.z += model.position.z;

			meshWire.geometry.computeFaceNormals();
			meshWire.geometry.computeVertexNormals();
			meshWire.geometry.computeBoundingBox();

			g.FILLINGS[this.HOLE_INDEX].wireframe = meshWire;
			GLOBAL.SCENE.add( meshWire );
		}

		// Draw the (moving) front
		if( CONFIG.DEBUG.SHOW_FRONT ) {
			var material = new THREE.LineBasicMaterial( {
				color: 0x4991E0,
				linewidth: 5
			} );
			var mesh = new THREE.Line( front, material );

			mesh.position.x += model.position.x;
			mesh.position.y += model.position.y;
			mesh.position.z += model.position.z;

			GLOBAL.SCENE.add( mesh );
		}

		render();
	},


	/**
	 * Update the faces of the filling, because the index of a vertex has been changed.
	 * @param  {THREE.Geometry} filling  The current state of the filling.
	 * @param  {int}            oldIndex The old vertex index.
	 * @param  {int}            newIndex The new vertex index.
	 */
	updateFaces: function( filling, oldIndex, newIndex ) {
		var face;

		for( var i = filling.faces.length - 1; i >= 0; i-- ) {
			face = filling.faces[i];

			// Replace all instances of the merged-away vertex
			if( face.a == oldIndex ) {
				face.a = newIndex;
			}
			if( face.b == oldIndex ) {
				face.b = newIndex;
			}
			if( face.c == oldIndex ) {
				face.c = newIndex;
			}

			// By removing a vertex all (greater) face indexes have to be updated.
			// May also remove faces, if necessary.
			filling.faces = Utils.decreaseHigherFaceIndexes( filling.faces, i, oldIndex );
		}
	}

};
