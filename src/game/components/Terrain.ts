import * as THREE from 'three';

export class Terrain {
    private mesh: THREE.Group;
    private size: number = 200;
    private resolution: number = 128;

    constructor() {
        this.mesh = new THREE.Group();
        this.generateTerrain();
        this.addDecorations();
    }

    private generateTerrain(): void {
        // Create ground geometry with heightmap
        const geometry = new THREE.PlaneGeometry(
            this.size,
            this.size,
            this.resolution - 1,
            this.resolution - 1
        );
        geometry.rotateX(-Math.PI / 2);

        // Generate heightmap
        const vertices = geometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const z = vertices[i + 2];
            
            // Create hills using multiple noise functions
            const height = 
                this.noise(x * 0.02, z * 0.02) * 5 +
                this.noise(x * 0.05, z * 0.05) * 2 +
                this.noise(x * 0.1, z * 0.1);
            
            vertices[i + 1] = height;
        }

        geometry.computeVertexNormals();

        // Create ground material
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a8505,
            roughness: 0.8,
        });

        const ground = new THREE.Mesh(geometry, groundMaterial);
        ground.receiveShadow = true;
        this.mesh.add(ground);
    }

    private addDecorations(): void {
        // Add trees with proper spacing and validation
        const treePositions = [];
        for (let i = 0; i < 100; i++) {
            const x = (Math.random() - 0.5) * this.size * 0.8;
            const z = (Math.random() - 0.5) * this.size * 0.8;
            
            // Ensure tree is not at origin
            if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;
            
            // Check if too close to other trees
            let tooClose = false;
            for (const pos of treePositions) {
                const dx = x - pos.x;
                const dz = z - pos.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                if (distance < 6) { // Minimum distance between trees
                    tooClose = true;
                    break;
                }
            }
            
            if (!tooClose) {
                const y = this.getHeightAt(x, z);
                treePositions.push({x, y, z});
                const tree = this.createTree();
                tree.position.set(x, y, z);
                
                // Validate tree position
                if (isNaN(x) || isNaN(y) || isNaN(z)) {
                    console.warn('Invalid tree position:', {x, y, z});
                    continue;
                }
                
                // Debug log for tree placement
                console.log('Placing tree at:', {
                    x: x.toFixed(2),
                    y: y.toFixed(2),
                    z: z.toFixed(2)
                });
                
                this.mesh.add(tree);
            }
        }

        // Add buildings
        this.addFarmhouse(20, 0, 20);
        this.addBarn(-20, 0, 20);
        this.addBarn(30, 0, -30);

        // Add fences
        this.addFences();
    }

    private createTree(): THREE.Group {
        const tree = new THREE.Group();
        tree.userData.type = 'tree';
        tree.userData.collisionRadius = 2;

        // Create trunk
        const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.4, 2, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({
            color: 0x4d2926,
            roughness: 0.9
        });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.castShadow = true;
        trunk.position.y = 1; // Center trunk at its base
        trunk.userData.type = 'tree_part'; // Mark as part, not a collision target

        // Create foliage
        const foliageGeometry = new THREE.ConeGeometry(2, 4, 8);
        const foliageMaterial = new THREE.MeshStandardMaterial({
            color: 0x0f5f13,
            roughness: 0.8
        });
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.y = 4; // Position relative to trunk
        foliage.castShadow = true;
        foliage.userData.type = 'tree_part'; // Mark as part, not a collision target

        tree.add(trunk, foliage);
        return tree;
    }

    private addFarmhouse(x: number, _y: number, z: number): void {
        const height = this.getHeightAt(x, z);
        const house = new THREE.Group();
        house.userData.type = 'building';
        house.userData.collisionRadius = 6;

        // Main building
        const buildingGeometry = new THREE.BoxGeometry(8, 6, 10);
        const buildingMaterial = new THREE.MeshStandardMaterial({
            color: 0xf0f0f0,
            roughness: 0.7
        });
        const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        building.castShadow = true;
        building.userData.type = 'building_part';

        // Roof
        const roofGeometry = new THREE.ConeGeometry(7, 4, 4);
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.8
        });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.y = 5;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        roof.userData.type = 'building_part';

        house.add(building, roof);
        house.position.set(x, height + 3, z);
        this.mesh.add(house);
    }

    private addBarn(x: number, _y: number, z: number): void {
        const height = this.getHeightAt(x, z);
        const barn = new THREE.Group();
        barn.userData.type = 'building';
        barn.userData.collisionRadius = 8;

        // Main structure
        const barnGeometry = new THREE.BoxGeometry(12, 8, 15);
        const barnMaterial = new THREE.MeshStandardMaterial({
            color: 0xcc0000,
            roughness: 0.8
        });
        const building = new THREE.Mesh(barnGeometry, barnMaterial);
        building.castShadow = true;
        building.userData.type = 'building_part';

        // Roof
        const roofGeometry = new THREE.ConeGeometry(8.5, 6, 4);
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: 0x4d2926,
            roughness: 0.9
        });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.y = 7;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        roof.userData.type = 'building_part';

        barn.add(building, roof);
        barn.position.set(x, height + 4, z);
        this.mesh.add(barn);
    }

    private addFences(): void {
        const fenceMaterial = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.9
        });

        // Create fence segments around the farm area
        for (let i = 0; i < 20; i++) {
            const angle = (i * Math.PI) / 10;
            const radius = 30;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const height = this.getHeightAt(x, z);

            const segment = new THREE.Group();
            segment.userData.type = 'fence';
            segment.userData.collisionRadius = 1;

            const fencePost = new THREE.Mesh(
                new THREE.BoxGeometry(0.3, 2, 0.3),
                fenceMaterial
            );
            fencePost.userData.type = 'fence_part';

            const rail = new THREE.Mesh(
                new THREE.BoxGeometry(4, 0.2, 0.1),
                fenceMaterial
            );
            rail.userData.type = 'fence_part';

            segment.add(fencePost);
            
            const rail1 = rail.clone();
            rail1.position.y = 0.5;
            rail1.position.x = 2;
            rail1.userData.type = 'fence_part';
            
            const rail2 = rail.clone();
            rail2.position.y = 1;
            rail2.position.x = 2;
            rail2.userData.type = 'fence_part';

            segment.add(rail1, rail2);
            segment.position.set(x, height, z);
            segment.lookAt(new THREE.Vector3(0, height, 0));
            
            this.mesh.add(segment);
        }
    }

    private noise(x: number, z: number): number {
        // Simple implementation of Perlin-like noise
        const X = Math.floor(x);
        const Z = Math.floor(z);
        
        x = x - X;
        z = z - Z;
        
        const u = this.fade(x);
        const v = this.fade(z);
        
        const A = this.hash(X) + Z;
        const B = this.hash(X + 1) + Z;
        
        return this.lerp(
            this.lerp(this.hash(A), this.hash(B), u),
            this.lerp(this.hash(A + 1), this.hash(B + 1), u),
            v
        ) * 2 - 1;
    }

    private fade(t: number): number {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    private lerp(a: number, b: number, t: number): number {
        return a + t * (b - a);
    }

    private hash(n: number): number {
        return Math.sin(n * 12.9898) * 43758.5453 % 1;
    }

    getHeightAt(x: number, z: number): number {
        return (
            this.noise(x * 0.02, z * 0.02) * 5 +
            this.noise(x * 0.05, z * 0.05) * 2 +
            this.noise(x * 0.1, z * 0.1)
        );
    }

    getNormalAt(x: number, z: number): THREE.Vector3 {
        const epsilon = 0.1;
        const heightCenter = this.getHeightAt(x, z);
        const heightX = this.getHeightAt(x + epsilon, z);
        const heightZ = this.getHeightAt(x, z + epsilon);
        
        const normal = new THREE.Vector3(
            -(heightX - heightCenter) / epsilon,
            1,
            -(heightZ - heightCenter) / epsilon
        );
        return normal.normalize();
    }

    getMesh(): THREE.Group {
        return this.mesh;
    }

    getColliders(): THREE.Object3D[] {
        const colliders: THREE.Object3D[] = [];
        this.mesh.traverse((object) => {
            // Check for objects that have collision properties
            if (object.userData.type && !object.userData.type.endsWith('_part')) {
                // Validate position
                const pos = object.position;
                if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
                    console.warn('Invalid object position:', object);
                    return;
                }
                if (pos.x === 0 && pos.y === 0 && pos.z === 0) {
                    console.warn('Object at origin:', object);
                    return;
                }
                
                // Debug log for collider collection
                console.log('Adding collider:', {
                    type: object.userData.type,
                    position: {
                        x: pos.x.toFixed(2),
                        y: pos.y.toFixed(2),
                        z: pos.z.toFixed(2)
                    },
                    radius: object.userData.collisionRadius
                });
                
                colliders.push(object);
            }
        });
        
        // Log total colliders by type
        const collidersByType = colliders.reduce((acc, obj) => {
            const type = obj.userData.type;
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {} as { [key: string]: number });
        
        console.log('Collected colliders by type:', collidersByType);
        
        return colliders;
    }
} 