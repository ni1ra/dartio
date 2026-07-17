import type { Metadata } from "next";
import { FriendsRoom } from "@/components/friends-room";
export const metadata:Metadata={title:"Friends"};
export default function FriendsPage(){return <FriendsRoom/>;}
