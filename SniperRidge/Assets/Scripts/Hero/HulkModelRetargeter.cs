using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace SniperRidge
{
    // The legacy clips use world-aligned bone axes. Transfer their anatomical
    // directions, rather than copying local Euler angles into the FBX bone axes.
    public sealed class HulkModelRetargeter : MonoBehaviour
    {
        public Transform[] MotionBones;
        public Animator Character;
        public SkinnedMeshRenderer[] VisibleRenderers;
        sealed class Link { public Transform source,target;public Quaternion offset; }
        readonly List<Link> links=new List<Link>();
        sealed class Finger { public Transform bone;public Quaternion rest;public Vector3 axis;public float degrees; }
        readonly List<Finger> fingers=new List<Finger>();
        Transform[] hands=new Transform[2];Quaternion[] handOffsets=new Quaternion[2], wristOffsets=new Quaternion[2];
        readonly Transform[,] thumbs=new Transform[2,3];
        readonly Transform[,] knuckles=new Transform[2,2];
        readonly Vector3[] palmLocal=new Vector3[2];
        Transform sourceHips,targetHips;
        Vector3 sourceBindPosition,targetBindPosition;
        float proportion;
        public bool Ready => links.Count>0;
        public void Initialize()
        {
            if(Ready)return;
            if(!Character || !Character.avatar || !Character.avatar.isHuman)
                throw new InvalidOperationException("Olive Titan requires a valid Humanoid avatar.");
            Character.enabled=false;Character.applyRootMotion=false;
            var source=MotionBones.ToDictionary(b=>b.name);
            Transform Target(HumanBodyBones bone)=>Character.GetBoneTransform(bone);
            void Add(string from,HumanBodyBones to,string sourceEnd=null,HumanBodyBones targetEnd=HumanBodyBones.LastBone)
            {
                var a=source[from];var b=Target(to);if(!b)return;
                Quaternion alignment=Quaternion.identity;
                if(sourceEnd!=null&&source.TryGetValue(sourceEnd,out var end)&&targetEnd!=HumanBodyBones.LastBone&&Target(targetEnd))
                    alignment=Quaternion.FromToRotation(Target(targetEnd).position-b.position,end.position-a.position);
                links.Add(new Link{source=a,target=b,offset=Quaternion.Inverse(a.rotation)*alignment*b.rotation});
            }
            Add("Hips",HumanBodyBones.Hips);Add("Spine",HumanBodyBones.Spine);
            Add("Chest",HumanBodyBones.Chest);Add("Chest",HumanBodyBones.UpperChest);
            Add("Neck",HumanBodyBones.Neck);Add("Head",HumanBodyBones.Head);
            foreach(string side in new[]{"Left","Right"})
            {
                // The old pack named +X limbs Left. The new FBX uses anatomical sides.
                string from=side=="Left"?"Right":"Left";
                HumanBodyBones Id(string suffix)=>(HumanBodyBones)Enum.Parse(typeof(HumanBodyBones),side+suffix);
                Add(from+"Clavicle",Id("Shoulder"));
                Add(from+"UpperArm",Id("UpperArm"),from+"Forearm",Id("LowerArm"));
                Add(from+"Forearm",Id("LowerArm"),from+"Hand",Id("Hand"));
                Add(from+"Hand",Id("Hand"),from+"MiddleProx",Id("MiddleProximal"));
                foreach(string finger in new[]{"Thumb","Index","Middle","Ring","Little"})
                {
                    Add(from+finger+"Prox",Id(finger+"Proximal"),from+finger+"Dist",Id(finger+"Intermediate"));
                    Add(from+finger+"Dist",Id(finger+"Intermediate"));
                    Add(from+finger+"Dist",Id(finger+"Distal"));
                }
                Add(from+"Thigh",Id("UpperLeg"),from+"Calf",Id("LowerLeg"));
                Add(from+"Calf",Id("LowerLeg"),from+"Foot",Id("Foot"));
                Add(from+"Foot",Id("Foot"),from+"Toes",Id("Toes"));
                Add(from+"Toes",Id("Toes"));
                int handIndex=side=="Left"?0:1;var hand=Target(Id("Hand"));hands[handIndex]=hand;
                Vector3 fingerDirection=(Target(Id("MiddleProximal")).position-hand.position).normalized;
                Vector3 across=(Target(Id("IndexProximal")).position-Target(Id("LittleProximal")).position).normalized;
                Vector3 palm=Vector3.Cross(fingerDirection,across).normalized;
                if(side=="Left")palm=-palm; // Anatomical handedness, not world-facing direction.
                palmLocal[handIndex]=hand.InverseTransformDirection(palm);
                knuckles[handIndex,0]=Target(Id("IndexIntermediate"));
                knuckles[handIndex,1]=Target(Id("MiddleIntermediate"));
                thumbs[handIndex,0]=Target(Id("ThumbProximal"));
                thumbs[handIndex,1]=Target(Id("ThumbIntermediate"));
                thumbs[handIndex,2]=Target(Id("ThumbDistal"));
                handOffsets[handIndex]=Quaternion.Inverse(Quaternion.LookRotation(palm,fingerDirection))*hand.rotation;
                wristOffsets[handIndex]=Quaternion.Inverse(Quaternion.LookRotation(fingerDirection,palm))*hand.rotation;
                foreach(string digit in new[]{"Thumb","Index","Middle","Ring","Little"})
                {
                    string[] joints={"Proximal","Intermediate","Distal"};
                    for(int j=0;j<3;j++)
                    {
                        var bone=Target(Id(digit+joints[j]));
                        // A consistent palm-space hinge avoids accumulating bone-roll errors.
                        Vector3 axis=Quaternion.Inverse(bone.rotation)*Vector3.Cross(bone.up,palm).normalized;
                        fingers.Add(new Finger{bone=bone,rest=bone.localRotation,axis=axis,degrees=digit=="Thumb"?new[]{35f,50f,40f}[j]:new[]{80f,90f,55f}[j]});
                    }
                }
            }
            sourceHips=source["Hips"];targetHips=Target(HumanBodyBones.Hips);
            sourceBindPosition=transform.InverseTransformPoint(sourceHips.position);
            targetBindPosition=Character.transform.InverseTransformPoint(targetHips.position);
            proportion=targetBindPosition.y/sourceBindPosition.y;
        }
        public void AlignWrist(bool left,Vector3 forward,Vector3 palm)
        {
            int i=left?0:1;
            hands[i].rotation=Quaternion.LookRotation(forward,Vector3.ProjectOnPlane(palm,forward).normalized)*wristOffsets[i];
        }
        public void PoseHands(float fist,float clap)
        {
            if(!Ready)return;
            foreach(var finger in fingers)finger.bone.localRotation=finger.rest*Quaternion.AngleAxis(finger.degrees*Mathf.Clamp01(fist),finger.axis);
            for(int i=0;i<2;i++)OpposeThumb(i,Mathf.Clamp01(fist));
            if(clap<=0)return;
            Vector3 toward=(hands[1].position-hands[0].position).normalized;
            for(int i=0;i<2;i++)
            {
                Quaternion rotation=Quaternion.LookRotation(i==0?toward:-toward,transform.up)*handOffsets[i];
                hands[i].rotation=Quaternion.Slerp(hands[i].rotation,rotation,clap);
            }
        }
        void OpposeThumb(int side,float weight)
        {
            if(weight<=0)return;
            var a=thumbs[side,0];var b=thumbs[side,1];var c=thumbs[side,2];
            Quaternion ar=a.localRotation,br=b.localRotation,cr=c.localRotation;
            Vector3 palm=hands[side].TransformDirection(palmLocal[side]);
            Vector3 across=(knuckles[side,1].position-knuckles[side,0].position).normalized;
            Vector3 target=knuckles[side,0].position+palm*.018f;
            float upper=Vector3.Distance(a.position,b.position),lower=Vector3.Distance(b.position,c.position);
            Vector3 delta=target-a.position;float distance=Mathf.Clamp(delta.magnitude,.015f,upper+lower-.003f);
            Vector3 forward=delta.normalized;
            Vector3 bend=Vector3.ProjectOnPlane(palm-across*.4f,forward).normalized;
            float along=(upper*upper-lower*lower+distance*distance)/(2*distance);
            Vector3 elbow=a.position+forward*along+bend*Mathf.Sqrt(Mathf.Max(0,upper*upper-along*along));
            a.rotation=Quaternion.FromToRotation(b.position-a.position,elbow-a.position)*a.rotation;
            b.rotation=Quaternion.FromToRotation(c.position-b.position,a.position+forward*distance-b.position)*b.rotation;
            c.rotation=Quaternion.FromToRotation(c.up,across)*c.rotation;
            a.localRotation=Quaternion.Slerp(ar,a.localRotation,weight);
            b.localRotation=Quaternion.Slerp(br,b.localRotation,weight);
            c.localRotation=Quaternion.Slerp(cr,c.localRotation,weight);
        }
        public void SyncPose()
        {
            if(!Ready)return;
            Vector3 delta=transform.InverseTransformPoint(sourceHips.position)-sourceBindPosition;
            targetHips.position=Character.transform.TransformPoint(targetBindPosition+delta*proportion);
            // Parent-first world rotations also account for UpperChest and the FBX's bone rolls.
            foreach(var link in links)link.target.rotation=link.source.rotation*link.offset;
        }
    }
}
