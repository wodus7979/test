using System.Collections.Generic;
using System.Linq;
using UnityEngine;
namespace SniperRidge
{
    /// <summary>Maps the supplied animation skeleton to the new anatomical skin using bind-space directions.</summary>
    public sealed class KairosRig : MonoBehaviour
    {
        sealed class Link { public Transform source,target; public Quaternion offset; }
        readonly List<Link> links=new List<Link>();
        Transform motionRoot,appearance,sourceHip,targetHip;
        Transform[] sourceFeet,targetFeet;
        Vector3 sourceBindHip,targetBindHip,appearanceRest;
        float sourceBindSole,targetBindSole,legRatio;
        public bool Ready=>links.Count>=50;
        public GameObject Character=>appearance.gameObject;
        public void Initialize(GameObject character,SkinnedMeshRenderer original)
        {
            motionRoot=transform;appearance=character.transform;appearanceRest=appearance.localPosition;
            var source=original.bones.ToDictionary(b=>b.name.Split(':').Last());
            var target=character.GetComponentsInChildren<Transform>().ToDictionary(b=>b.name);
            var bind=new Dictionary<string,Matrix4x4>();
            for(int i=0;i<original.bones.Length;i++)bind[original.bones[i].name.Split(':').Last()]=original.transform.localToWorldMatrix*original.sharedMesh.bindposes[i].inverse;
            Vector3 Point(string name)=>bind[name].GetColumn(3);
            string End(string name)
            {
                switch(name){case "Hips":return null;case "Spine":return "Spine1";case "Spine1":return "Spine2";case "Spine2":return "Neck";case "Neck":return "Head";case "Head":return null;}
                foreach(string side in new[]{"Left","Right"})if(name.StartsWith(side))
                {
                    string n=name.Substring(side.Length);
                    switch(n){case "Shoulder":return side+"Arm";case "Arm":return side+"ForeArm";case "ForeArm":return side+"Hand";case "Hand":return side+"HandMiddle1";case "UpLeg":return side+"Leg";case "Leg":return side+"Foot";case "Foot":return side+"ToeBase";}
                    if(n.StartsWith("Hand")&&char.IsDigit(n[n.Length-1])&&n[n.Length-1]<'3')return name.Substring(0,name.Length-1)+(char)(n[n.Length-1]+1);
                }
                return null;
            }
            foreach(var t in character.GetComponentsInChildren<Transform>())
            {
                if(!source.TryGetValue(t.name,out var s)||!bind.ContainsKey(t.name))continue;
                var align=Quaternion.identity;string end=End(t.name);
                // Keep the human torso's bind shape. The source mutant's chest/clavicle
                // axes are tilted differently; aligning these endpoints folds the chest.
                bool limb=t.name.Contains("Arm")||t.name.Contains("Hand")||t.name.Contains("Leg")||t.name.EndsWith("Foot");
                if(limb&&end!=null&&target.ContainsKey(end)&&bind.ContainsKey(end))
                    align=Quaternion.FromToRotation(target[end].position-t.position,Point(end)-Point(t.name));
                links.Add(new Link{source=s,target=t,offset=Quaternion.Inverse(bind[t.name].rotation)*align*t.rotation});
            }
            sourceHip=source["Hips"];targetHip=target["Hips"];
            sourceBindHip=motionRoot.InverseTransformPoint(Point("Hips"));targetBindHip=motionRoot.InverseTransformPoint(targetHip.position);
            sourceFeet=new[]{source["LeftFoot"],source["LeftToeBase"],source["RightFoot"],source["RightToeBase"]};
            targetFeet=new[]{target["LeftFoot"],target["LeftToeBase"],target["RightFoot"],target["RightToeBase"]};
            sourceBindSole=sourceFeet.Min(f=>motionRoot.InverseTransformPoint(Point(f.name.Split(':').Last())).y);
            targetBindSole=targetFeet.Min(f=>motionRoot.InverseTransformPoint(f.position).y);
            legRatio=(targetBindHip.y-targetBindSole)/(sourceBindHip.y-sourceBindSole);
            if(!Ready)throw new System.InvalidOperationException("Kairos: missing anatomical animation links: "+links.Count);
        }
        public void ApplyPose()
        {
            if(!Ready)return;
            appearance.localPosition=appearanceRest;
            targetHip.position=motionRoot.TransformPoint(targetBindHip+(motionRoot.InverseTransformPoint(sourceHip.position)-sourceBindHip)*legRatio);
            // Hierarchy order: set a parent's world rotation before its children.
            foreach(var link in links)link.target.rotation=link.source.rotation*link.offset;
            float sourceLow=sourceFeet.Min(f=>motionRoot.InverseTransformPoint(f.position).y);
            float targetLow=targetFeet.Min(f=>motionRoot.InverseTransformPoint(f.position).y);
            appearance.localPosition+=Vector3.up*((sourceLow-sourceBindSole)*legRatio-(targetLow-targetBindSole));
        }
    }
}
