import { UFO } from '../components/UFO';
import * as THREE from 'three';

export class Controls {
    private ufo: UFO;
    private keys: { [key: string]: boolean } = {};
    private moveSpeed: number = 0.5;
    private rotateSpeed: number = 0.05;
    private verticalSpeed: number = 0.3;
    private intendedMovement: THREE.Vector3 = new THREE.Vector3();

    constructor(ufo: UFO) {
        this.ufo = ufo;
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        document.addEventListener('keydown', (event) => {
            // Use event.code for more reliable key detection
            const key = event.code.toLowerCase();
            this.keys[key] = true;
            
            // Handle spacebar for beam
            if (event.code === 'Space') {
                this.ufo.toggleBeam(true);
            }
            
            console.log('Key pressed:', key); // Debug logging
        });

        document.addEventListener('keyup', (event) => {
            const key = event.code.toLowerCase();
            this.keys[key] = false;
            
            // Handle spacebar for beam
            if (event.code === 'Space') {
                this.ufo.toggleBeam(false);
            }
        });
    }

    getNextPosition(): THREE.Vector3 {
        const currentPosition = this.ufo.getPosition();
        const currentRotation = this.ufo.getRotation();
        const movement = new THREE.Vector3();

        // Calculate forward/backward movement using proper key codes
        if (this.keys['arrowup'] || this.keys['arrowdown'] || 
            this.keys['keyw'] || this.keys['keys']) {
            const forward = new THREE.Vector3(
                Math.sin(currentRotation.y),
                0,
                Math.cos(currentRotation.y)
            );
            const speed = (this.keys['arrowup'] || this.keys['keyw']) ? this.moveSpeed : -this.moveSpeed;
            movement.add(forward.multiplyScalar(speed));
        }

        // Calculate vertical movement
        if (this.keys['keyz']) {
            movement.y += this.verticalSpeed;
        }
        if (this.keys['keyx']) {
            movement.y -= this.verticalSpeed;
        }

        // Return predicted next position
        return new THREE.Vector3(
            currentPosition.x + movement.x,
            currentPosition.y + movement.y,
            currentPosition.z + movement.z
        );
    }

    update(): void {
        const nextPosition = this.getNextPosition();
        this.ufo.setPosition(nextPosition.x, nextPosition.y, nextPosition.z);

        // Handle rotation with proper key codes
        if (this.keys['arrowleft'] || this.keys['keya']) {
            this.ufo.rotate(this.rotateSpeed);
        }
        if (this.keys['arrowright'] || this.keys['keyd']) {
            this.ufo.rotate(-this.rotateSpeed);
        }
    }

    isBeamActive(): boolean {
        return this.ufo.getBeamActive();
    }
} 