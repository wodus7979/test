using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace SniperRidge
{
    public sealed partial class TankRampage
    {
        enum TurretPhase { None, Approach, Climb, Plant, Pull, Throw, Dismount }
        TurretPhase turretPhase;
        float motionSeconds=1,clipFrom,clipTo=1;
        Vector3 deckRoot,gripCenter,turretOrigin,turretGripLocal,throwGripLocal;
        Quaternion turretRotation,throwHeldRotation,approachTurretRotation;
        float alignStarted;
        bool turretReleased;
        Vector3 actionCameraPosition;
        bool actionCameraReady;
        readonly List<Canvas> hiddenCanvases=new List<Canvas>();
        bool escapePresentation;
        float escapeAge;
        Vector3 escapeDirection,escapeRight,escapeCameraPosition;
        public int EscapePlays { get; private set; }
        public string ChoreographyPhase=>turretPhase.ToString();
        public float GripError { get; private set; }
        public float FootContactError { get; private set; }

        static float Ease(float t)=>Mathf.SmoothStep(0,1,Mathf.Clamp01(t));
        Transform Bone(string name)=>Hero.Visual.MotionBones.First(t=>t.name=="mixamorig:"+name);
        IEnumerator MotionRange(AnimationClip clip,float seconds,float from,float to,System.Action<float> frame=null)
        {
            clipFrom=from;clipTo=to;
            yield return PlayMotion(clip,seconds,frame);
            clipFrom=0;clipTo=1;
        }
        void Limb(string side,bool leg,Vector3 target,float weight=1)
        {
            var upper=Bone(side+(leg?"UpLeg":"Arm"));var lower=Bone(side+(leg?"Leg":"ForeArm"));var tip=Bone(side+(leg?"Foot":"Hand"));
            var right=GM.Player.transform.right;var forward=GM.Player.transform.forward;
            Vector3 pole=leg?upper.position+forward*2:lower.position+right*(side=="Left"?-.6f:.6f)-forward*.25f;
            EnemyAnimationRig.SolveLimb(upper,lower,tip,Vector3.Lerp(tip.position,target,weight),pole);
        }
        // Native climb has a 1.3 m root ascent. The authored trajectory owns that movement.
        // Keep the native knee/hip flexion, removing only its duplicate vertical translation.
        void NormalizeFeet()
        {
            var hips=Bone("Hips");var local=hips.localPosition;local.x=local.z=0;hips.localPosition=local;
            float bottom=Mathf.Min(Bone("LeftFoot").position.y,Bone("RightFoot").position.y);
            Bone("Hips").position+=Vector3.up*(GM.Player.transform.position.y+.31f-bottom);
        }
        void PlantFeet(float weight=1)
        {
            foreach(var side in new[]{"Left","Right"})
            {
                Vector3 point=deckRoot+GM.Player.transform.right*(side=="Left"?-.43f:.43f)+GM.Player.transform.forward*(side=="Left"?.13f:-.13f)+Vector3.up*.31f;
                Limb(side,true,point,weight);
                FootContactError=Mathf.Max(FootContactError,Mathf.Abs(Bone(side+"Foot").position.y-point.y));
            }
        }
        void Grip(Vector3 center,float weight=1)
        {
            GripError=0;
            foreach(var side in new[]{"Left","Right"})
            {
                var point=center+GM.Player.transform.right*(side=="Left"?-.34f:.34f);
                Limb(side,false,point,weight);
                GripError=Mathf.Max(GripError,Vector3.Distance(Bone(side+"Hand").position,point));
            }
        }
        void PoseTurretAction()
        {
            if(turretPhase==TurretPhase.None)return;
            NormalizeFeet();
            if(capturedTank&&(turretPhase==TurretPhase.Approach||turretPhase==TurretPhase.Climb))
                capturedTank.Turret.localRotation=Quaternion.Slerp(approachTurretRotation,Quaternion.identity,Ease((Time.time-alignStarted)/.35f));
            if(turretPhase==TurretPhase.Climb)
            {
                float weight=Ease(motionProgress/.18f)*(1-Ease((motionProgress-.38f)/.20f));
                Grip(gripCenter,weight);
            }
            else if(turretPhase==TurretPhase.Plant){FootContactError=0;PlantFeet(Ease(motionProgress));}
            else if(turretPhase==TurretPhase.Pull)
            {
                FootContactError=0;PlantFeet();
                float lift=Ease((motionProgress-.38f)/.62f);
                Vector3 contact=gripCenter+Vector3.up*(1.9f*lift)-GM.Player.transform.forward*(.24f*lift);
                Grip(contact);
                if(carriedTurret)
                {
                    carriedTurret.rotation=turretRotation*Quaternion.Euler(-8*lift,0,3*Mathf.Sin(lift*Mathf.PI));
                    carriedTurret.position=contact-carriedTurret.TransformVector(turretGripLocal);
                }
            }
            else if(turretPhase==TurretPhase.Throw&&!turretReleased&&carriedTurret)
            {
                // One-handed overarm Goalie Throw: keep the left palm attached until release.
                var hand=Bone("LeftHand");float blend=Ease(motionProgress/.16f);
                var desired=hand.rotation*throwHeldRotation;
                carriedTurret.rotation=Quaternion.Slerp(turretRotation,desired,blend);
                carriedTurret.position=hand.position-carriedTurret.TransformVector(throwGripLocal);
            }
        }
        IEnumerator RipTurret(TankVehicle tank)
        {
            turretReleased=false;actionCameraReady=false;alignStarted=Time.time;approachTurretRotation=tank.Turret.localRotation;
            var facing=Quaternion.LookRotation(Vector3.ProjectOnPlane(tank.transform.forward,Vector3.up));
            var start=GM.Player.transform.position;
            // Stand on the rear engine deck, never on the turret being removed.
            var hull=tank.GetComponentsInChildren<BoxCollider>().First(c=>c.transform.name=="Hull");
            float deckY=hull.transform.TransformPoint(hull.center+Vector3.up*hull.size.y*.5f).y;
            var turretBox=tank.Turret.GetComponent<BoxCollider>();
            Vector3 rear=turretBox?turretBox.center+Vector3.back*turretBox.size.z*.5f:new Vector3(0,0,-1.5f);
            gripCenter=tank.transform.TransformPoint(tank.Turret.localPosition+Vector3.Scale(rear,tank.Turret.localScale))+Vector3.up*.18f;
            deckRoot=gripCenter-tank.transform.forward*.85f;deckRoot.y=deckY+.04f;
            var entry=Ground(deckRoot-tank.transform.forward*1.45f);
            turretPhase=TurretPhase.Approach;
            float approach=Mathf.Clamp(Vector3.Distance(start,entry)/7f,.18f,1.3f);
            action="전차 뒤로 접근";
            // Route around the outside when approaching from the front, avoiding a trip through the hull.
            Vector3 local=tank.transform.InverseTransformPoint(start);
            var corner=Ground(tank.transform.TransformPoint(local.x<0?-3.4f:3.4f,0,-4.4f));
            if(local.z>-1)
            {
                var side=Ground(tank.transform.TransformPoint(local.x<0?-3.4f:3.4f,0,Mathf.Max(4.5f,local.z)));
                var approachFacing=Quaternion.LookRotation(Vector3.ProjectOnPlane(side-start,Vector3.up));
                yield return MotionRange(Set.Run,Mathf.Clamp(Vector3.Distance(start,side)/8,.25f,1.1f),0,1,u=>PlaceHero(Vector3.Lerp(start,side,Ease(u)),approachFacing));
                start=side;
                yield return MotionRange(Set.Run,Mathf.Clamp(Vector3.Distance(start,corner)/8,.3f,1.5f),0,1,u=>PlaceHero(Vector3.Lerp(start,corner,Ease(u)),Quaternion.Slerp(GM.Player.transform.rotation,Quaternion.LookRotation(corner-start),Ease(u))));
                start=corner;
            }
            yield return MotionRange(Set.Run,approach,0,1,u=>PlaceHero(Vector3.Lerp(start,entry,Ease(u)),facing));
            action="전차 올라타기";turretPhase=TurretPhase.Climb;ClimbPlays++;
            yield return MotionRange(Set.TankClimb,1.12f,0,1,u=>
            {
                // Jump up first, clear the rear edge, then settle onto the engine deck.
                Vector3 point=Vector3.Lerp(entry,deckRoot,Ease((u-.18f)/.72f));
                point.y=Mathf.Lerp(entry.y,deckRoot.y,Ease(u/.64f))+.48f*Mathf.Sin(Mathf.PI*u);
                PlaceHero(point,facing);
            });
            action="발을 딛고 포탑 잡기";turretPhase=TurretPhase.Plant;
            yield return MotionRange(Set.TankPull,.30f,0,0,u=>PlaceHero(deckRoot,facing));
            turretPhase=TurretPhase.Pull;action="포탑을 뜯는 중";
            turretOrigin=tank.Turret.position;turretRotation=tank.Turret.rotation;
            turretGripLocal=tank.Turret.InverseTransformPoint(gripCenter);
            bool torn=false;
            // Hold the loaded crouch, then use only the lift section (the source lowers it again).
            yield return MotionRange(Set.TankPull,1.42f,0,.43f,u=>
            {
                PlaceHero(deckRoot,facing);
                if(u>.38f&&!torn)
                {
                    torn=true;carriedTurret=tank.DetachTurret();Hero.Audio.Play(HulkAudio.Cue.Slam,.85f);
                    Effects.Puff(turretOrigin,Vector3.up,1.2f,new Color(.4f,.37f,.3f),.65f);
                }
            });
            action="포탑 던지기";turretPhase=TurretPhase.Throw;
            var palm=Bone("LeftHand");throwGripLocal=carriedTurret.InverseTransformPoint(palm.position);
            throwHeldRotation=Quaternion.Inverse(palm.rotation)*carriedTurret.rotation;turretRotation=carriedTurret.rotation;
            Vector3 direction=(tank.transform.forward+Vector3.up*.28f).normalized;
            yield return MotionRange(Set.TankThrow,1.02f,0,.64f,u=>
            {
                // Sample the exact release pose before separating the turret from the palm.
                if(u>=.48f&&!turretReleased)
                {
                    PoseHero();turretReleased=true;var thrown=carriedTurret;carriedTurret=null;
                    RampageThrownObject.Launch(thrown.gameObject,direction,48,4,tank);
                    tank.HeroHit(tank.RemainingShellHits);Hero.Audio.Play(HulkAudio.Cue.PunchSwing);
                }
            });
            action="전차에서 뛰어내리기";turretPhase=TurretPhase.Dismount;
            var landing=SafeExit(tank.transform.position);
            yield return MotionRange(Set.Jump,.68f,Set.JumpTakeoff/Set.Jump.length,Set.JumpLanding/Set.Jump.length,u=>
                PlaceHero(Vector3.Lerp(deckRoot,landing,u)+Vector3.up*Mathf.Sin(u*Mathf.PI)*.7f,facing));
            yield return MotionRange(Set.Jump,.23f,Set.JumpLanding/Set.Jump.length,1,u=>PlaceHero(landing,facing));
            FinishAction();
        }
        void UpdateActionCamera(Vector3 focus,Vector3 desired)
        {
            if(!actionCameraReady){actionCameraPosition=GM.Player.Eye.position;actionCameraReady=true;}
            actionCameraPosition=Vector3.Lerp(actionCameraPosition,desired,1-Mathf.Exp(-5*Time.deltaTime));
            GM.Player.Eye.SetPositionAndRotation(actionCameraPosition,Quaternion.LookRotation(focus-actionCameraPosition));
        }

        Vector3 EscapeLanding(TankVehicle wreck)
        {
            var from=wreck.transform.TransformPoint(-.5f,2.7f,-1);
            Physics.SyncTransforms();
            for(float radius=9;radius<=18;radius+=3)
                for(int a=0;a<16;a++)
                {
                    var exit=Ground(wreck.transform.position+Quaternion.Euler(0,a*22.5f,0)*Vector3.forward*radius);
                    if(Mathf.Abs(exit.x)>TankBattle.Bounds-3||Mathf.Abs(exit.z)>TankBattle.Bounds-3)continue;
                    if(Physics.CheckCapsule(exit+Vector3.up*.9f,exit+Vector3.up*2,.84f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))continue;
                    bool blocked=false;Vector3 previous=from+Vector3.up;
                    for(int i=1;i<=16;i++)
                    {
                        float u=i/16f;var next=Vector3.Lerp(from,exit,u)+Vector3.up*(1+12.8f*u*(1-u));
                        if(Physics.SphereCastAll(previous,.5f,(next-previous).normalized,Vector3.Distance(previous,next),EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)
                            .Any(h=>!h.transform.IsChildOf(wreck.transform)&&!h.transform.IsChildOf(GM.Player.transform))){blocked=true;break;}
                        previous=next;
                    }
                    if(!blocked)return exit;
                }
            return SafeExit(wreck.transform.position);
        }
        public string EscapePhase { get; private set; }="None";
        IEnumerator Escape()
        {
            EscapePlays++;escapePresentation=true;escapeAge=0;
            foreach(var canvas in FindObjectsOfType<Canvas>())if(canvas.enabled){hiddenCanvases.Add(canvas);canvas.enabled=false;}
            var wreck=battle.PlayerTank;var exit=EscapeLanding(wreck);
            var from=wreck.transform.TransformPoint(-.5f,2.7f,-1);
            escapeDirection=Vector3.ProjectOnPlane(exit-from,Vector3.up).normalized;escapeRight=Vector3.Cross(Vector3.up,escapeDirection);
            cameraFocus=from;escapeCameraPosition=from+escapeRight*8-escapeDirection*4+Vector3.up*2;
            escapingHuman=Instantiate(EnemyModels.Prefab);escapingHuman.name="Player blast ejection cinematic";
            foreach(var a in escapingHuman.GetComponentsInChildren<Animator>())a.enabled=false;
            foreach(var b in escapingHuman.GetComponentsInChildren<MonoBehaviour>())b.enabled=false;
            foreach(var c in escapingHuman.GetComponentsInChildren<Collider>())c.enabled=false;
            foreach(var t in escapingHuman.GetComponentsInChildren<Transform>())t.gameObject.layer=2;
            var fall=Resources.Load<AnimationClip>("Enemies/TankBlastFall");
            var getUp=Resources.Load<AnimationClip>("Enemies/TankGetUp");
            var bones=escapingHuman.GetComponentsInChildren<Transform>();
            Transform hip=bones.FirstOrDefault(t=>t.name.ToLowerInvariant().EndsWith("hips"));
            var feet=bones.Where(t=>t.name.ToLowerInvariant().EndsWith("foot")).ToArray();
            Quaternion facing=Quaternion.LookRotation(escapeDirection)*Quaternion.Euler(0,EnemyModels.YawOffset,0);
            EscapePhase="Ejected";
            RocketEffects.Explosion(from,.38f);GM.PlaySound(GM.Sounds.RocketExplosion,.7f);
            // The clip supplies the human joint motion; the scene owns the blast trajectory.
            for(float t=0;t<1.5f;t+=Time.deltaTime)
            {
                float u=t/1.5f;escapeAge=t;
                fall.SampleAnimation(escapingHuman,fall.length*Mathf.Lerp(0,.55f,u));
                escapingHuman.transform.SetPositionAndRotation(Vector3.Lerp(from,exit,u)+Vector3.up*(12.8f*u*(1-u)),facing);
                cameraFocus=hip?hip.position:escapingHuman.transform.position+Vector3.up*.7f;yield return null;
            }
            EscapePhase="Falling";
            Effects.Puff(exit,Vector3.up,1.35f,new Color(.48f,.43f,.36f),.65f);GM.PlaySound(GM.Sounds.RocketExplosion,.16f);
            for(float t=0;t<.6f;t+=Time.deltaTime)
            {
                escapeAge=1.5f+t;
                fall.SampleAnimation(escapingHuman,Mathf.Lerp(fall.length*.55f,fall.length,t/.6f));
                escapingHuman.transform.SetPositionAndRotation(exit,facing);
                cameraFocus=hip?hip.position:exit+Vector3.up*.5f;yield return null;
            }
            fall.SampleAnimation(escapingHuman,fall.length);
            escapingHuman.transform.SetPositionAndRotation(exit,facing);
            EscapePhase="Prone";
            var lyingRot=bones.Select(b=>b.localRotation).ToArray();
            var lyingPos=bones.Select(b=>b.localPosition).ToArray();
            // Both animations meet in a face-down rest. Only the short transition is blended.
            for(float t=0;t<.45f;t+=Time.deltaTime)
            {
                getUp.SampleAnimation(escapingHuman,0);
                float blend=Ease(t/.45f);
                for(int i=1;i<bones.Length;i++){bones[i].localRotation=Quaternion.Slerp(lyingRot[i],bones[i].localRotation,blend);bones[i].localPosition=Vector3.Lerp(lyingPos[i],bones[i].localPosition,blend);}
                escapingHuman.transform.SetPositionAndRotation(exit,facing);yield return null;
            }
            EscapePhase="GettingUp";
            float getUpSeconds=Mathf.Clamp(getUp.length/1.18f,2.6f,4.8f);
            for(float t=0;t<getUpSeconds;t+=Time.deltaTime)
            {
                escapeAge=2.55f+t;
                getUp.SampleAnimation(escapingHuman,getUp.length*Mathf.Clamp01(t/getUpSeconds));
                escapingHuman.transform.SetPositionAndRotation(exit,facing);
                cameraFocus=hip?hip.position+Vector3.up*.25f:exit+Vector3.up;yield return null;
            }
            getUp.SampleAnimation(escapingHuman,getUp.length);
            escapingHuman.transform.SetPositionAndRotation(exit,facing);
            if(feet.Length>0)exit=Ground(feet.Aggregate(Vector3.zero,(sum,f)=>sum+f.position)/feet.Length);
            EscapePhase="Transforming";
            GM.Player.transform.rotation=Quaternion.LookRotation(escapeDirection);
            GM.Player.LeaveTank(exit);GM.Health.Configure(5,6);Escaped=true;
            Destroy(escapingHuman);escapingHuman=null;Cinematic=false;
            if(!Hero.Toggle())
            {
                var controller=GM.Player.GetComponent<CharacterController>();controller.enabled=false;GM.Player.transform.position=SafeExit(exit);controller.enabled=true;
                Hero.Toggle();
            }
            // Include the newly created abilities canvas in the cinematic, restoring only what we hid.
            foreach(var canvas in FindObjectsOfType<Canvas>())if(canvas.enabled){hiddenCanvases.Add(canvas);canvas.enabled=false;}
            // Hero.Toggle already starts the same single roar used by city transformation.
            for(float t=0;t<HulkController.TransformDuration;t+=Time.deltaTime)
            {escapeAge=2.55f+getUpSeconds+t;cameraFocus=GM.Player.transform.position+Vector3.up*Mathf.Lerp(1.3f,1.9f,Ease(t/HulkController.TransformDuration));yield return null;}
            EscapePhase="Complete";EndEscapePresentation();
            GM.Hud.Announce("분노의 반격 · E 집기·투척·포탑 뜯기·돌진 반격 · R 전차 들어 던지기");
        }
        void UpdateEscapeCamera()
        {
            if(!escapePresentation)return;
            Vector3 desired=cameraFocus+escapeRight*(escapeAge<1.97f?7.5f:4.8f)-escapeDirection*3+Vector3.up*(escapeAge<1.97f?2.1f:.7f);
            desired.y=Mathf.Max(desired.y,TerrainGenerator.GroundHeight(GM.Terrain,desired.x,desired.z)+.8f);
            // Keep the shot in front of solid scenery when an explosion happens next to trees or rocks.
            if(Physics.SphereCast(cameraFocus,.22f,(desired-cameraFocus).normalized,out var hit,Vector3.Distance(cameraFocus,desired),EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
                desired=cameraFocus+(desired-cameraFocus).normalized*Mathf.Max(1.4f,hit.distance-.2f);
            escapeCameraPosition=Vector3.Lerp(escapeCameraPosition,desired,1-Mathf.Exp(-6*Time.deltaTime));
            GM.Player.Eye.SetPositionAndRotation(escapeCameraPosition,Quaternion.LookRotation(cameraFocus-escapeCameraPosition));
            GM.Player.Eye.GetComponent<Camera>().fieldOfView=Mathf.Lerp(57,48,Ease((escapeAge-2)/2));
            if(Escaped&&Hero&&Hero.Visual)Hero.Visual.SetVisible(true);
        }
        void OnGUI()
        {
            if(!escapePresentation)return;
            var color=GUI.color;GUI.color=Color.black;
            GUI.DrawTexture(new Rect(0,0,Screen.width,Screen.height*.09f),Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(0,Screen.height*.91f,Screen.width,Screen.height*.09f),Texture2D.whiteTexture);
            GUI.color=color;
        }
        void EndEscapePresentation()
        {
            escapePresentation=false;foreach(var canvas in hiddenCanvases)if(canvas)canvas.enabled=true;hiddenCanvases.Clear();
        }
    }
}
