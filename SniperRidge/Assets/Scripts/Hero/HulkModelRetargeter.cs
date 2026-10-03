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
        Transform[] hands=new Transform[2];Quaternion[] handOffsets=new Quaternion[2];
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
                Vector3 palm=Vector3.ProjectOnPlane(Character.transform.forward,fingerDirection).normalized;
                handOffsets[handIndex]=Quaternion.Inverse(Quaternion.LookRotation(palm,fingerDirection))*hand.rotation;
                foreach(string digit in new[]{"Thumb","Index","Middle","Ring","Little"})
                {
                    string[] joints={"Proximal","Intermediate","Distal"};
                    for(int j=0;j<3;j++)
                    {
                        var bone=Target(Id(digit+joints[j]));
                        Vector3 axis=Quaternion.Inverse(bone.rotation)*Vector3.Cross(fingerDirection,palm).normalized;
                        fingers.Add(new Finger{bone=bone,rest=bone.localRotation,axis=axis,degrees=digit=="Thumb"?new[]{35f,50f,35f}[j]:new[]{75f,90f,60f}[j]});
                    }
                }
            }
            sourceHips=source["Hips"];targetHips=Target(HumanBodyBones.Hips);
            sourceBindPosition=transform.InverseTransformPoint(sourceHips.position);
            targetBindPosition=Character.transform.InverseTransformPoint(targetHips.position);
            proportion=targetBindPosition.y/sourceBindPosition.y;
        }
        public void PoseHands(float fist,float clap)
        {
            if(!Ready)return;
            foreach(var finger in fingers)finger.bone.localRotation=finger.rest*Quaternion.AngleAxis(finger.degrees*Mathf.Clamp01(fist),finger.axis);
            if(clap<=0)return;
            Vector3 toward=(hands[1].position-hands[0].position).normalized;
            for(int i=0;i<2;i++)
            {
                Quaternion rotation=Quaternion.LookRotation(i==0?toward:-toward,transform.up)*handOffsets[i];
                hands[i].rotation=Quaternion.Slerp(hands[i].rotation,rotation,clap);
            }
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
