﻿module BABYLON {
    export class DefaultRenderingPipeline extends PostProcessRenderPipeline implements IDisposable, IAnimatable {
        private _scene: Scene;     

        readonly PassPostProcessId: string = "PassPostProcessEffect";           
        readonly HighLightsPostProcessId: string = "HighLightsPostProcessEffect";  
        readonly BlurXPostProcessId: string = "BlurXPostProcessEffect";  
        readonly BlurYPostProcessId: string = "BlurYPostProcessEffect";  
        readonly CopyBackPostProcessId: string = "CopyBackPostProcessEffect";  
        readonly ImageProcessingPostProcessId: string = "ImageProcessingPostProcessEffect";  
        readonly FxaaPostProcessId: string = "FxaaPostProcessEffect";           
        readonly FinalMergePostProcessId: string = "FinalMergePostProcessEffect";

        // Post-processes
		public pass: BABYLON.PassPostProcess;
		public highlights: BABYLON.HighlightsPostProcess;
		public blurX: BABYLON.BlurPostProcess;
		public blurY: BABYLON.BlurPostProcess;
		public copyBack: BABYLON.PassPostProcess;
        public fxaa: FxaaPostProcess;
        public imageProcessing: ImageProcessingPostProcess;
		public finalMerge: BABYLON.PassPostProcess;        

        // IAnimatable
        public animations: Animation[] = [];        

        // Values       
        private _bloomEnabled: boolean = false;
        private _fxaaEnabled: boolean = false;
        private _imageProcessingEnabled: boolean = false;
        private _defaultPipelineTextureType: number;
        private _bloomScale: number = 0.6;

        /**
		 * Specifies the size of the bloom blur kernel, relative to the final output size
		 */
        @serialize()
		public bloomKernel: number = 64;

        /**
		 * Specifies the weight of the bloom in the final rendering
		 */
        @serialize()
		public bloomWeight: number = 0.15;        

        @serialize()
        private _hdr: boolean;

        public set bloomScale(value: number) {
            if (this._bloomScale === value) {
                return;
            }
            this._bloomScale = value;

            this._buildPipeline();
        }   
        
        @serialize()
        public get bloomScale(): number {
            return this._bloomScale;
        }          

        public set bloomEnabled(enabled: boolean) {
            if (this._bloomEnabled === enabled) {
                return;
            }
            this._bloomEnabled = enabled;

            this._buildPipeline();
        }   
        
        @serialize()
        public get bloomEnabled(): boolean {
            return this._bloomEnabled;
        }        

        public set fxaaEnabled(enabled: boolean) {
            if (this._fxaaEnabled === enabled) {
                return;
            }
            this._fxaaEnabled = enabled;

            this._buildPipeline();
        }

        @serialize()
        public get fxaaEnabled(): boolean {
            return this._fxaaEnabled;
        }

        /**
         * @constructor
         * @param {string} name - The rendering pipeline name
         * @param {BABYLON.Scene} scene - The scene linked to this pipeline
         * @param {any} ratio - The size of the postprocesses (0.5 means that your postprocess will have a width = canvas.width 0.5 and a height = canvas.height 0.5)
         * @param {BABYLON.Camera[]} cameras - The array of cameras that the rendering pipeline will be attached to
         */
        constructor(name: string, hdr: boolean, scene: Scene, cameras?: Camera[]) {
            super(scene.getEngine(), name);
            this._cameras = cameras || [];

            // Initialize
            this._hdr = hdr;
            this._scene = scene;

            // Misc
            this._defaultPipelineTextureType = scene.getEngine().getCaps().textureFloatRender ? Engine.TEXTURETYPE_FLOAT : Engine.TEXTURETYPE_HALF_FLOAT;

            // Attach
            scene.postProcessRenderPipelineManager.addPipeline(this);

            this._buildPipeline();
        }

        private _buildPipeline() {
            var engine = this._scene.getEngine();

            this._disposePostProcesses();
            this._reset();

			if (this.bloomEnabled) {
				this.pass = new BABYLON.PassPostProcess("sceneRenderTarget", 1.0, null, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
                this.addEffect(new PostProcessRenderEffect(engine, this.PassPostProcessId, () => { return this.pass; }, true));

				if (!this._hdr) { // Need to enhance highlights if not using float rendering
					this.highlights = new BABYLON.HighlightsPostProcess("highlights", this.bloomScale, null, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
                    this.addEffect(new PostProcessRenderEffect(engine, this.HighLightsPostProcessId, () => { return this.highlights; }, true));
					this.highlights.autoClear = false;
					this.highlights.alwaysForcePOT = true;
				}

				this.blurX = new BABYLON.BlurPostProcess("horizontal blur", new BABYLON.Vector2(1.0, 0), 10.0, this.bloomScale, null, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
                this.addEffect(new PostProcessRenderEffect(engine, this.BlurXPostProcessId, () => { return this.blurX; }, true));
				this.blurX.alwaysForcePOT = true;
				this.blurX.autoClear = false;
				this.blurX.onActivateObservable.add(() => {
					let dw = this.blurX.width / engine.getRenderingCanvas().width;
					this.blurX.kernel = this.bloomKernel * dw;
				});

				this.blurY = new BABYLON.BlurPostProcess("vertical blur", new BABYLON.Vector2(0, 1.0), 10.0, this.bloomScale, null, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
                this.addEffect(new PostProcessRenderEffect(engine, this.BlurYPostProcessId, () => { return this.blurY; }, true));
				this.blurY.alwaysForcePOT = true;
				this.blurY.autoClear = false;
				this.blurY.onActivateObservable.add(() => {
					let dh = this.blurY.height / engine.getRenderingCanvas().height;
					this.blurY.kernel = this.bloomKernel * dh;
				});				

				this.copyBack = new BABYLON.PassPostProcess("bloomBlendBlit", this.bloomScale, null, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);			
                this.addEffect(new PostProcessRenderEffect(engine, this.CopyBackPostProcessId, () => { return this.copyBack; }, true));
				this.copyBack.alwaysForcePOT = true;
				if (this._hdr) {
					this.copyBack.alphaMode = BABYLON.Engine.ALPHA_INTERPOLATE;
					let w = this.bloomWeight;
					this.copyBack.alphaConstants = new BABYLON.Color4(w, w, w, w);			
				} else {
					this.copyBack.alphaMode = BABYLON.Engine.ALPHA_SCREENMODE;
				}
				this.copyBack.autoClear = false;
			}

			this.imageProcessing = new BABYLON.ImageProcessingPostProcess("imageProcessing",  1.0, null, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
			if (this._hdr) {
				this.addEffect(new PostProcessRenderEffect(engine, this.ImageProcessingPostProcessId, () => { return this.imageProcessing; }, true));
			}

			if (this.fxaaEnabled) {
                this.fxaa = new FxaaPostProcess("fxaa", 1.0, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
                this.addEffect(new PostProcessRenderEffect(engine, this.FxaaPostProcessId, () => { return this.fxaa; }, true));               
				this.fxaa.autoClear = false;
			} else {
				this.finalMerge = new BABYLON.PassPostProcess("finalMerge", 1.0, null, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
                this.addEffect(new PostProcessRenderEffect(engine, this.FinalMergePostProcessId, () => { return this.finalMerge; }, true)); 
				this.finalMerge.autoClear = false;
			}

			if (this.bloomEnabled) {
				if (this._hdr) { // Share render targets to save memory
					this.copyBack.shareOutputWith(this.blurX);		
					this.imageProcessing.shareOutputWith(this.pass);			
					this.imageProcessing.autoClear = false;
				} else  {
					if (this.fxaa) {
						this.fxaa.shareOutputWith(this.pass);		
					} else {
						this.finalMerge.shareOutputWith(this.pass);	
					} 
				}
			}

            if (this._cameras !== null) {
                this._scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(this._name, this._cameras);
            }            
        }

        private _disposePostProcesses(): void {
            for (var i = 0; i < this._cameras.length; i++) {
                var camera = this._cameras[i];

                if (this.pass) {
                    this.pass.dispose(camera);
                    this.pass = null;
                }

                if (this.highlights) {
                    this.highlights.dispose(camera);
                    this.highlights = null;
                }        

                if (this.blurX) {
                    this.blurX.dispose(camera);
                    this.blurX = null;
                }      

                if (this.blurY) {
                    this.blurY.dispose(camera);
                    this.blurY = null;
                }         

                if (this.copyBack) {
                    this.copyBack.dispose(camera);
                    this.copyBack = null;
                }   

                if (this.imageProcessing) {
                    this.imageProcessing.dispose(camera);
                    this.imageProcessing = null;
                }                                                                

                if (this.fxaa) {
                    this.fxaa.dispose(camera);
                    this.fxaa = null;
                }

                if (this.finalMerge) {
                    this.finalMerge.dispose(camera);
                    this.finalMerge = null;
                }                
            }
        }

        // Dispose
        public dispose(): void {
            this._disposePostProcesses();

            this._scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline(this._name, this._cameras);

            super.dispose();
        }

        // Serialize rendering pipeline
        public serialize(): any {
            var serializationObject = SerializationHelper.Serialize(this);   
            serializationObject.customType = "DefaultRenderingPipeline";

            return serializationObject;
        }

        // Parse serialized pipeline
        public static Parse(source: any, scene: Scene, rootUrl: string): DefaultRenderingPipeline {
            return SerializationHelper.Parse(() => new DefaultRenderingPipeline(source._name, source._name._hdr, scene), source, scene, rootUrl);
        }
    }
}