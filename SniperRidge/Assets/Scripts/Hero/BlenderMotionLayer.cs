using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>Samples retargeted user FBX motion, with procedural fallback for the other abilities.</summary>
    public sealed class BlenderMotionLayer
    {
        readonly BlenderMotionSet set;
        readonly GameObject ghost;
        struct Pair
        {
            public Transform source, target;
            public Vector3 bindPosition;
            public bool upper;
        }
        readonly List<Pair> joints = new List<Pair>();
        Quaternion[] lastPose, outgoing;
        Vector3[] lastPosition, outgoingPosition;
        AnimationClip previous;
        float blendAge;
        bool outgoingFullBody;
        bool lastFullBody;
        public bool FullBodyPose { get; private set; }
        public bool AuthoredCombat => Ready && set.FullBodyCombat;
        public bool Ready => set && ghost && joints.Count > 0;
        public bool FullBodyRun => Ready && set.FullBodyRun && set.Run;
        public float RunStride => Mathf.Max(.1f, set.FullBodyRunStride);
        public AnimationClip ActiveClip => previous;

        public BlenderMotionLayer(Animator character)
        {
            set = Resources.Load<BlenderMotionSet>("Hero/OliveTitanMotion");
            if (!set || !set.SamplingRig) return;
            var targets = new Dictionary<string, Transform>();
            foreach (var t in character.GetComponentsInChildren<Transform>()) targets[t.name] = t;
            ghost = Object.Instantiate(set.SamplingRig, character.transform, false);
            ghost.name = "Blender motion sampler";
            ghost.hideFlags = HideFlags.HideInHierarchy | HideFlags.DontSave;
            foreach (var animator in ghost.GetComponentsInChildren<Animator>()) animator.enabled = false;
            foreach (var t in ghost.GetComponentsInChildren<Transform>())
            {
                string n = t.name;
                // CharacterController owns world movement. Never copy animated root translation.
                if (n == "Root" || !targets.TryGetValue(n, out var target)) continue;
                bool upper = n == "Spine" || n == "Chest" || n == "UpperChest" || n == "Neck" || n == "Head" ||
                    n.Contains("Shoulder") || n.Contains("Arm") || n.Contains("Hand");
                joints.Add(new Pair { source = t, target = target, bindPosition = target.localPosition, upper = upper });
            }
        }

        // Full-body clips key joint positions as well as rotations. Restore the bind offsets
        // before the procedural combat retargeter runs, so a previous run cannot distort it.
        public void RestorePositions()
        {
            foreach (var pair in joints) pair.target.localPosition = pair.bindPosition;
        }

        public void Apply(float speed, float gaitPhase, float idleTime, HulkController.Attack attack, float age,
            bool left, bool launched, float velocity, bool landed, float transformation, float dt)
        {
            if (!Ready) return;
            FullBodyPose=false;
            if (transformation >= 0) { previous = null; outgoingFullBody = lastFullBody = false; return; }
            AnimationClip clip;
            float phase;
            bool fullBody = FullBodyRun && attack == HulkController.Attack.None && speed > .15f;
            if (attack == HulkController.Attack.Punch)
            {
                clip=left?set.PunchLeft:set.PunchRight;
                // Keep the FBX stance at rest. Moving attacks retain the contact-aware
                // walking legs, so WASD never drags planted feet across the ground.
                phase=age/HulkController.PunchDuration;fullBody=AuthoredCombat&&speed<.45f;
            }
            else if (attack == HulkController.Attack.Kick) { clip=set.Kick;phase=age/HulkController.KickDuration;fullBody=AuthoredCombat; }
            else if (attack == HulkController.Attack.Clap) { clip = set.Clap; phase = age / 1.1f; }
            else if (attack == HulkController.Attack.Slam)
            {
                if (landed) { clip = set.Land; phase = age / .55f; }
                else if (!launched) { clip = set.JumpLoad; phase = age / HulkController.JumpWindup; }
                else { clip = set.JumpAir; phase = Mathf.InverseLerp(13, -13, velocity); }
            }
            else
            {
                clip = fullBody ? set.Run : speed > 7 ? set.Run : speed > .15f ? set.Walk : set.Idle;
                phase = speed > .15f ? Mathf.Repeat(gaitPhase, 1) : Mathf.Repeat(idleTime / 3.8f, 1);
            }
            if (!clip) return;
            if(lastFullBody&&!fullBody)outgoingFullBody=true;
            if (lastPose == null)
            {
                lastPose = new Quaternion[joints.Count]; outgoing = new Quaternion[joints.Count];
                lastPosition = new Vector3[joints.Count]; outgoingPosition = new Vector3[joints.Count];
                for (int i = 0; i < joints.Count; i++)
                { lastPose[i] = joints[i].target.localRotation; lastPosition[i] = joints[i].target.localPosition; }
            }
            if (previous != clip)
            {
                outgoingFullBody = lastFullBody;
                System.Array.Copy(lastPose, outgoing, joints.Count);
                System.Array.Copy(lastPosition, outgoingPosition, joints.Count);
                blendAge = 0; previous = clip;
            }
            blendAge += Mathf.Max(0, dt);
            FullBodyPose=fullBody;lastFullBody=fullBody;
            float transition = Mathf.SmoothStep(0, 1, Mathf.Clamp01(blendAge / .12f));
            clip.SampleAnimation(ghost, Mathf.Clamp01(phase) * clip.length);
            float weight = attack == HulkController.Attack.None ? Mathf.SmoothStep(0, 1, Mathf.InverseLerp(.08f, 1.1f, speed)) : 1;
            if (clip == set.Idle) weight = 1;
            for (int i = 0; i < joints.Count; i++)
            {
                var pair = joints[i];
                if (fullBody || pair.upper)
                {
                    var authored = Quaternion.Slerp(outgoing[i], pair.source.localRotation, transition);
                    pair.target.localRotation = Quaternion.Slerp(pair.target.localRotation, authored, weight);
                    if (fullBody)
                    {
                        var position = Vector3.Lerp(outgoingPosition[i], pair.source.localPosition, transition);
                        pair.target.localPosition = Vector3.Lerp(pair.target.localPosition, position, weight);
                    }
                }
                else if (outgoingFullBody && attack == HulkController.Attack.None && transition < 1)
                {
                    pair.target.localRotation = Quaternion.Slerp(outgoing[i], pair.target.localRotation, transition);
                    pair.target.localPosition = Vector3.Lerp(outgoingPosition[i], pair.target.localPosition, transition);
                }
                lastPose[i] = pair.target.localRotation;
                lastPosition[i] = pair.target.localPosition;
            }
        }
    }
}
