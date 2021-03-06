import chain from 'popmotion/compositors/chain';
import delayAction from 'popmotion/compositors/delay';
import { flipPose, isFlipPose } from '../dom/flip';
import { just } from '../inc/default-transitions';
import {
  Pose,
  Poser,
  PoseSetter,
  PoseSetterFactoryProps,
  ChildPoses,
  PoseSetterProps
} from '../types';
import { getPoseValues } from '../inc/selectors';

export type PoseSetterFactory = (props: PoseSetterFactoryProps) => PoseSetter;

type AnimationsPromiseList = Array<Promise<any>>;

export const resolveProp = (target: any, props: PoseSetterProps) =>
  typeof target === 'function' ? target(props) : target;

const poseDefault = (
  pose: Pose,
  prop: string,
  defaultValue: any,
  resolveProps: PoseSetterProps
) =>
  pose && pose[prop] !== undefined
    ? resolveProp(pose[prop], resolveProps)
    : defaultValue;

const startChildAnimations = (
  children: ChildPoses,
  next: string,
  nextPose: Pose,
  props: PoseSetterProps
): Array<Promise<any>> => {
  const animations: Array<Promise<any>> = [];
  const delay = poseDefault(nextPose, 'delayChildren', 0, props);
  const stagger = poseDefault(nextPose, 'staggerChildren', 0, props);
  const staggerDirection = poseDefault(nextPose, 'staggerDirection', 1, props);

  const maxStaggerDuration = (children.size - 1) * stagger;
  const generateStaggerDuration =
    staggerDirection === 1
      ? (i: number) => i * stagger
      : (i: number) => maxStaggerDuration - i * stagger;

  Array.from(children).forEach((child: Poser, i: number) => {
    animations.push(
      child.set(next, {
        ...props,
        delay: delay + generateStaggerDuration(i)
      })
    );
  });

  return animations;
};

const createPoseSetter: PoseSetterFactory = setterProps => (
  next,
  props = {}
) => {
  const {
    activeActions,
    activePoses,
    children,
    poses,
    dimensions,
    values,
    types,
    dragProps,
    getTransitionProps,
    flipEnabled
  } = setterProps;

  const { delay = 0 } = props;
  const animations: AnimationsPromiseList = [];
  const { dragBounds } = dragProps;
  let nextPose = poses[next];

  const baseTransitionProps = {
    ...getTransitionProps(),
    ...props
  };

  if (nextPose) {
    if (flipEnabled && isFlipPose(nextPose, next))
      nextPose = flipPose(setterProps, nextPose);

    const { transition: getTransition } = nextPose;

    const poserAnimations = Object.keys(getPoseValues(nextPose)).map(
      key =>
        new Promise(complete => {
          const value = values.get(key);
          const type = types.get(key);
          const from = value.get();

          const transitionProps = {
            key,
            type,
            from: type ? type.parse(from) : from,
            velocity: value.getVelocity() || 0,
            prevPoseKey: activePoses.get(key),
            dimensions,
            dragBounds,
            ...baseTransitionProps
          };

          const unparsedTarget = resolveProp(nextPose[key], transitionProps);

          // Stop the current action
          if (activeActions.has(key)) activeActions.get(key).stop();

          // Get transition if `transition` prop isn't false
          let transition = getTransition({
            to: type ? type.parse(unparsedTarget) : unparsedTarget,
            ...transitionProps
          });

          if (transition === false) transition = just(unparsedTarget);

          // Add delay if defined
          const poseDelay = resolveProp(nextPose.delay, baseTransitionProps);
          if (delay || poseDelay) {
            transition = chain(delayAction(delay || poseDelay), transition);
          }

          if (type) transition = transition.pipe(type.transform);

          // Start transition
          const transitionApi = transition.start({
            update: (v: any) => value.update(v),
            complete
          });

          activeActions.set(key, transitionApi);
          activePoses.set(key, next);
        })
    );

    animations.push(...poserAnimations);
  }

  // Get children animation Promises
  if (children.size)
    animations.push(
      ...startChildAnimations(children, next, nextPose, baseTransitionProps)
    );

  return Promise.all(animations);
};

export default createPoseSetter;
