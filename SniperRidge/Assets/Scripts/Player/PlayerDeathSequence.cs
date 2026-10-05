using System.Linq;
using UnityEngine;

namespace SniperRidge
{
    [DefaultExecutionOrder(400)]
    public sealed class PlayerDeathSequence : MonoBehaviour
    {
        GameManager game;
        HulkVisual mutant;
        GameObject body;
        AnimationClip clip;
        Transform hip;
        Vector3 cameraStart,root;
        Quaternion cameraRotation;
        float age,duration,modelBaseY,groundLevel,fallSpeed;
        Mesh baked;
        SkinnedMeshRenderer[] skins;
        public float Progress=>Mathf.Clamp01(age/duration);
        public GameObject Body=>body;

        public void Begin(GameManager gm)
        {
            game=gm;var player=gm.Player;var hero=player.Hulk;
            cameraStart=player.Eye.position;cameraRotation=player.Eye.rotation;
            if(hero)
            {
                hero.CancelForExternal();if(hero.Street){hero.Street.Drop();hero.Street.enabled=false;}
                if(hero.Audio)hero.Audio.Stop();hero.enabled=false;
            }
            if(gm.Armor&&gm.Armor.Rampage)gm.Armor.Rampage.DropHeld();
            player.enabled=false;
            foreach(var renderer in player.Eye.GetComponentsInChildren<Renderer>())renderer.enabled=false;
            var capsule=player.GetComponent<CharacterController>();if(capsule)capsule.enabled=false;
            root=player.transform.position;groundLevel=EnemyPropKnockback.Ground(root,player.transform,root.y);
            root.y=Mathf.Max(root.y,groundLevel);
            player.transform.position=root;
            if(player.IsHulk&&hero.Visual)
            {
                mutant=hero.Visual;mutant.SetVisible(true);mutant.BeginExternalMotion();
                body=mutant.Model;clip=mutant.Definition.Death;
            }
            else
            {
                body=Instantiate(EnemyModels.Prefab,root,player.transform.rotation*Quaternion.Euler(0,EnemyModels.YawOffset,0));
                body.name="Player fallen body";
                foreach(var b in body.GetComponentsInChildren<MonoBehaviour>())b.enabled=false;
                foreach(var a in body.GetComponentsInChildren<Animator>())a.enabled=false;
                foreach(var c in body.GetComponentsInChildren<Collider>())c.enabled=false;
                foreach(var t in body.GetComponentsInChildren<Transform>())t.gameObject.layer=2;
                clip=Resources.Load<AnimationClip>("Enemies/PlayerDeath");
            }
            hip=EnemyRagdoll.FindBone(body.transform,"Hips");
            skins=body.GetComponentsInChildren<SkinnedMeshRenderer>();foreach(var skin in skins)skin.updateWhenOffscreen=true;
            baked=new Mesh();modelBaseY=body.transform.localPosition.y;
            duration=clip?clip.length:2.5f;
            player.Eye.GetComponent<Camera>().fieldOfView=60;
        }
        void LateUpdate()
        {
            if(!game||!game.IsDying)return;
            age+=Time.deltaTime;
            if(root.y>groundLevel)
            {fallSpeed+=20*Time.deltaTime;root.y=Mathf.Max(groundLevel,root.y-fallSpeed*Time.deltaTime);transform.position=root;if(!mutant)body.transform.position=root;}
            if(clip)
            {
                if(mutant)mutant.SampleExternal(clip,Progress,Mathf.SmoothStep(0,1,age/.18f));
                else clip.SampleAnimation(body,Mathf.Min(age,clip.length));
            }
            // Native mutant proportions differ from the soldier; ground the actual skinned pose.
            if(mutant)
            {
                var p=body.transform.localPosition;p.y=modelBaseY;body.transform.localPosition=p;
                float floor=float.PositiveInfinity;
                foreach(var skin in skins){skin.BakeMesh(baked);foreach(var v in baked.vertices)floor=Mathf.Min(floor,skin.transform.TransformPoint(v).y);}
                if(!float.IsInfinity(floor))body.transform.position+=Vector3.up*(root.y+.015f-floor);
            }
            Vector3 focus=hip?hip.position:root+Vector3.up*.5f;
            Vector3 offset=-transform.forward*(mutant?6:4.5f)+transform.right*3+Vector3.up*2.5f;
            Vector3 desired=focus+offset;
            if(Physics.SphereCast(focus,.18f,offset.normalized,out var hit,offset.magnitude,Physics.DefaultRaycastLayers,QueryTriggerInteraction.Ignore))
                desired=focus+offset.normalized*Mathf.Max(.3f,hit.distance-.15f);
            float blend=Mathf.SmoothStep(0,1,age/.7f);
            game.Player.Eye.SetPositionAndRotation(Vector3.Lerp(cameraStart,desired,blend),Quaternion.Slerp(cameraRotation,Quaternion.LookRotation(focus-desired),blend));
            if(age>=duration+.5f)game.FinishPlayerDeath();
        }
        void OnDestroy(){if(baked)Destroy(baked);}
    }
}
